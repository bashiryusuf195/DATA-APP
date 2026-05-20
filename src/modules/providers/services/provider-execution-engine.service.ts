import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { providerRegistry } from "./provider-registry.service";
import { getActiveRoutingRule } from "./provider-routing-rules.service";
import {
  recordProviderAttempt,
  getSuccessfulAttempt,
  getFailedAttemptProviderCodes,
} from "./provider-attempts.service";
import { updateTransactionStatus } from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import {
  recordSuccess as metricsRecordSuccess,
  recordFailure as metricsRecordFailure,
  isCircuitOpen,
} from "./provider-health-metrics.service";
import { classifyError } from "./error-classifier.service";
import { processReferralReward } from "../../referral/services/referral-reward.service";
import type { VTUProvider } from "./provider.interface";
import type { ProviderPurchaseInput, ProviderPurchaseResult, ProviderServiceType } from "../types/provider.types";

const db            = getDbInstance();
const walletService = new WalletService(db);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransactionForExecution {
  user_id:               string;
  status:                string;
  source_wallet_id:      string | null;
  destination_wallet_id: string | null;
  amount:                number | string;
  currency:              string;
}

export interface PlanProviderOverrides {
  primary_provider_code:  string | null | undefined;
  fallback_provider_code: string | null | undefined;
}

export interface ExecuteWithFailoverParams {
  service_type:          ProviderServiceType;
  purchase_input:        ProviderPurchaseInput;
  transaction_reference: string;
  transaction:           TransactionForExecution;
  plan_overrides?:       PlanProviderOverrides;
}

export interface RejectedProvider {
  provider_code: string;
  reason:        string;
}

export interface ExecuteWithFailoverResult {
  success:              boolean;
  provider_result:      ProviderPurchaseResult | null;
  final_provider:       string | null;
  attempted_providers:  string[];
  rejected_providers:   RejectedProvider[];
  failover_triggered:   boolean;
  total_attempts:       number;
  idempotent_replay:    boolean;
  total_latency_ms:     number;
}

interface ProviderCandidate {
  providerCode: string;
  provider:     VTUProvider;
  isFailover:   boolean;
}

// ── Engine ────────────────────────────────────────────────────────────────────

class ProviderExecutionEngine {

  // ── Public API ─────────────────────────────────────────────────────────────

  async executeWithFailover(
    params: ExecuteWithFailoverParams
  ): Promise<ExecuteWithFailoverResult> {
    const { service_type, purchase_input, transaction_reference, transaction } = params;
    const tag = `[ENGINE][${transaction_reference}]`;
    const executionStartedAt = new Date();

    // ── Guard: terminal state ─────────────────────────────────────────────────
    if (transaction.status === "successful" || transaction.status === "failed") {
      console.log(`${tag} Already in terminal state (${transaction.status}) — skipping`);
      return this.idempotentResult(transaction.status === "successful");
    }

    // ── Idempotency: successful attempt already recorded ─────────────────────
    const existingSuccess = await getSuccessfulAttempt(transaction_reference);
    if (existingSuccess) {
      console.log(
        `${tag} Idempotent replay — successful attempt already recorded`,
        `| provider=${existingSuccess.provider_code}`
      );
      return this.idempotentResult(true, existingSuccess.provider_code);
    }

    // ── Providers already tried in a previous BullMQ attempt ─────────────────
    const alreadyFailedCodes = await getFailedAttemptProviderCodes(transaction_reference);
    if (alreadyFailedCodes.length > 0) {
      console.log(`${tag} Skipping previously failed providers:`, alreadyFailedCodes.join(", "));
    }

    // ── Resolve ordered provider candidates ───────────────────────────────────
    const { candidates, rejectedProviders } = await this.resolveProviderCandidates(
      service_type,
      new Set(alreadyFailedCodes),
      params.plan_overrides,
    );

    if (candidates.length === 0) {
      const reason = "No eligible providers configured or available";
      console.warn(`${tag} ${reason} for ${service_type}`, `| rejected=${rejectedProviders.length}`);
      await this.handleAllFailed(params, [], rejectedProviders, reason, executionStartedAt);
      return {
        success: false, provider_result: null, final_provider: null,
        attempted_providers: [], rejected_providers: rejectedProviders,
        failover_triggered: false, total_attempts: 0, idempotent_replay: false,
        total_latency_ms: Date.now() - executionStartedAt.getTime(),
      };
    }

    // ── Execute with provider-level failover ──────────────────────────────────
    const attemptedProviders: string[] = [];
    let failoverTriggered              = false;
    let attemptNumber                  = alreadyFailedCodes.length + 1;
    let lastError                      = "All providers exhausted";

    for (const candidate of candidates) {
      const { providerCode, provider, isFailover } = candidate;

      if (attemptedProviders.length > 0 || isFailover) failoverTriggered = true;
      attemptedProviders.push(providerCode);

      console.log(
        `${tag} Attempting provider '${providerCode}'`,
        `| attempt=${attemptNumber}`,
        `| failover=${failoverTriggered}`,
        `| service=${service_type}`
      );

      const start = Date.now();
      let result: ProviderPurchaseResult | null = null;
      let errorMsg: string | null = null;

      try {
        result = await provider.purchase(purchase_input);
      } catch (err) {
        errorMsg = (err as Error).message;
        console.error(`${tag} Provider '${providerCode}' threw exception:`, errorMsg);
      }

      const latencyMs = Date.now() - start;
      const success   = result?.success === true;

      const rawError  = errorMsg ?? (result?.success ? null : (result?.message ?? null));
      const errorClass = rawError ? classifyError(rawError) : null;

      // Sanitise request — strip phone/account numbers for audit
      const safeRequest: Record<string, unknown> = {
        service_type:   purchase_input.service_type,
        amount:         purchase_input.amount,
        variation_code: purchase_input.variation_code ?? null,
        reference:      purchase_input.reference,
      };

      await recordProviderAttempt({
        transaction_reference: transaction_reference,
        provider_code:         providerCode,
        attempt_number:        attemptNumber,
        request_payload:       safeRequest,
        response_payload:      (result?.raw_response as Record<string, unknown>) ?? {},
        success,
        error_message:         rawError,
        error_classification:  errorClass,
        latency_ms:            latencyMs,
      });

      // Update circuit breaker metrics
      if (success) {
        await metricsRecordSuccess(providerCode).catch((e: Error) =>
          console.error(`${tag} metricsRecordSuccess failed (non-fatal):`, e.message)
        );
      } else {
        await metricsRecordFailure(providerCode).catch((e: Error) =>
          console.error(`${tag} metricsRecordFailure failed (non-fatal):`, e.message)
        );
      }

      attemptNumber++;

      if (success && result) {
        const totalLatencyMs = Date.now() - executionStartedAt.getTime();
        console.log(
          `${tag} Provider '${providerCode}' succeeded`,
          `| latency=${latencyMs}ms`,
          `| totalLatency=${totalLatencyMs}ms`,
          `| failover_triggered=${failoverTriggered}`
        );
        await this.handleSuccess(params, result, attemptedProviders, rejectedProviders, failoverTriggered, executionStartedAt);
        return {
          success:             true,
          provider_result:     result,
          final_provider:      providerCode,
          attempted_providers: attemptedProviders,
          rejected_providers:  rejectedProviders,
          failover_triggered:  failoverTriggered,
          total_attempts:      attemptedProviders.length,
          idempotent_replay:   false,
          total_latency_ms:    totalLatencyMs,
        };
      }

      lastError = rawError ?? `Provider '${providerCode}' returned failure`;
      console.warn(
        `${tag} Provider '${providerCode}' failed — trying next`,
        `| reason=${lastError}`,
        `| classification=${errorClass ?? "unknown"}`,
        `| latency=${latencyMs}ms`
      );
    }

    // ── All providers exhausted ───────────────────────────────────────────────
    console.error(
      `${tag} All providers exhausted`,
      `| tried=${attemptedProviders.join(", ")}`,
      `| rejected=${rejectedProviders.map((r) => r.provider_code).join(", ")}`,
      `| service=${service_type}`
    );
    await this.handleAllFailed(params, attemptedProviders, rejectedProviders, lastError, executionStartedAt);

    return {
      success:             false,
      provider_result:     null,
      final_provider:      null,
      attempted_providers: attemptedProviders,
      rejected_providers:  rejectedProviders,
      failover_triggered:  failoverTriggered,
      total_attempts:      attemptedProviders.length,
      idempotent_replay:   false,
      total_latency_ms:    Date.now() - executionStartedAt.getTime(),
    };
  }

  // ── Candidate resolution ───────────────────────────────────────────────────

  private async resolveProviderCandidates(
    serviceType:    ProviderServiceType,
    skipCodes:      Set<string>,
    planOverrides?: PlanProviderOverrides,
  ): Promise<{ candidates: ProviderCandidate[]; rejectedProviders: RejectedProvider[] }> {
    const candidates:        ProviderCandidate[] = [];
    const rejectedProviders: RejectedProvider[]  = [];
    const seen = new Set<string>(skipCodes);

    // Track skipped-from-previous-attempts as rejected
    for (const code of skipCodes) {
      rejectedProviders.push({ provider_code: code, reason: "ALREADY_ATTEMPTED" });
    }

    // 1. Plan-level overrides (highest priority — set per service plan)
    if (planOverrides?.primary_provider_code) {
      const primary = planOverrides.primary_provider_code;
      console.log(`[ROUTING] plan override → primary '${primary}' for ${serviceType}`);
      await this.tryAddCandidate(primary, serviceType, false, seen, candidates, rejectedProviders);
      if (planOverrides.fallback_provider_code) {
        await this.tryAddCandidate(
          planOverrides.fallback_provider_code, serviceType, true, seen, candidates, rejectedProviders
        );
      }
      // Skip service-level routing rules when plan overrides are present
      if (candidates.length > 0) {
        // Still fall through to priority-based for additional fallback capacity
      }
    }

    // 2. Routing-rule path (primary → fallback)
    let rule = null;
    try {
      rule = await getActiveRoutingRule(serviceType);
    } catch {
      // table missing — fall through to priority-based
    }

    if (rule) {
      await this.tryAddCandidate(
        rule.primary_provider_code, serviceType, false, seen, candidates, rejectedProviders
      );
      if (rule.fallback_provider_code) {
        await this.tryAddCandidate(
          rule.fallback_provider_code, serviceType, true, seen, candidates, rejectedProviders
        );
      }
    }

    // 2. Priority-based path (active + supports service_type + not already included)
    const configs = await db("provider_configs")
      .where({ is_active: true })
      .whereRaw("supported_services @> ?::jsonb", [JSON.stringify([serviceType])])
      .whereNot("health_status", "unhealthy")
      .orderBy("priority", "asc");

    for (const config of configs) {
      const code = config.provider_code as string;
      if (seen.has(code)) continue;
      await this.tryAddCandidate(
        code, serviceType, candidates.length > 0, seen, candidates, rejectedProviders
      );
    }

    return { candidates, rejectedProviders };
  }

  private async tryAddCandidate(
    providerCode:      string,
    serviceType:       ProviderServiceType,
    isFailover:        boolean,
    seen:              Set<string>,
    candidates:        ProviderCandidate[],
    rejectedProviders: RejectedProvider[]
  ): Promise<void> {
    if (seen.has(providerCode)) return;

    // Circuit breaker check
    const circuitOpen = await isCircuitOpen(providerCode).catch(() => false);
    if (circuitOpen) {
      console.warn(`[ENGINE] Provider '${providerCode}' skipped — circuit open`);
      rejectedProviders.push({ provider_code: providerCode, reason: "CIRCUIT_OPEN" });
      seen.add(providerCode);
      return;
    }

    const eligible = await this.isProviderEligible(providerCode, serviceType);
    if (!eligible) {
      rejectedProviders.push({ provider_code: providerCode, reason: "INELIGIBLE" });
      seen.add(providerCode);
      return;
    }

    const provider = this.tryGetProvider(providerCode);
    if (!provider) {
      rejectedProviders.push({ provider_code: providerCode, reason: "NOT_IN_REGISTRY" });
      seen.add(providerCode);
      return;
    }

    candidates.push({ providerCode, provider, isFailover });
    seen.add(providerCode);
  }

  // ── Eligibility check ──────────────────────────────────────────────────────

  private async isProviderEligible(
    providerCode: string,
    serviceType:  ProviderServiceType
  ): Promise<boolean> {
    const config = await db("provider_configs")
      .where({ provider_code: providerCode, is_active: true })
      .whereNot("health_status", "unhealthy")
      .whereRaw("supported_services @> ?::jsonb", [JSON.stringify([serviceType])])
      .first();
    return !!config;
  }

  // ── Success handler ────────────────────────────────────────────────────────

  private async handleSuccess(
    params:             ExecuteWithFailoverParams,
    result:             ProviderPurchaseResult,
    attemptedProviders: string[],
    rejectedProviders:  RejectedProvider[],
    failoverTriggered:  boolean,
    executionStartedAt: Date
  ): Promise<void> {
    const executionCompletedAt = new Date();
    const executionMeta = {
      attempted_providers:    attemptedProviders,
      rejected_providers:     rejectedProviders,
      failover_triggered:     failoverTriggered,
      final_provider:         result.provider,
      failure_stage:          null,
      total_attempts:         attemptedProviders.length,
      all_failed:             false,
      execution_started_at:   executionStartedAt.toISOString(),
      execution_completed_at: executionCompletedAt.toISOString(),
      total_latency_ms:       executionCompletedAt.getTime() - executionStartedAt.getTime(),
    };

    await updateTransactionStatus(params.transaction_reference, {
      status:             "successful",
      provider:           result.provider,
      provider_reference: result.provider_reference,
      metadata: {
        provider_response: result.raw_response,
        execution:         executionMeta,
      },
    });

    // First-purchase referral reward (fire-and-forget)
    processReferralReward(
      "first_purchase",
      params.transaction.user_id,
      Number(params.transaction.amount)
    ).catch((err) =>
      console.error("[ENGINE] Referral reward failed (non-fatal):", (err as Error).message)
    );

    await createNotification({
      user_id: params.transaction.user_id,
      channel: "in_app",
      type:    "purchase_successful",
      title:   "Transaction Successful",
      message: `Your ${params.service_type} purchase was successful.`,
      metadata: {
        reference: params.transaction_reference,
        type:      params.service_type,
        amount:    Number(params.transaction.amount),
        provider:  result.provider,
      },
    }).catch((err) =>
      console.error("[ENGINE] Success notification failed (non-fatal):", (err as Error).message)
    );
  }

  // ── All-failed handler ────────────────────────────────────────────────────

  private async handleAllFailed(
    params:             ExecuteWithFailoverParams,
    attemptedProviders: string[],
    rejectedProviders:  RejectedProvider[],
    reason:             string,
    executionStartedAt: Date
  ): Promise<void> {
    const { transaction_reference, transaction, service_type } = params;
    const executionCompletedAt = new Date();

    let refundBatchId: string | null = null;
    const srcId  = transaction.source_wallet_id;
    const destId = transaction.destination_wallet_id;

    if (srcId && destId) {
      try {
        const refundResult = await walletService.transfer({
          from_wallet_id:  destId,
          to_wallet_id:    srcId,
          amount:          Number(transaction.amount),
          currency:        transaction.currency ?? "NGN",
          description:     `Refund for failed ${service_type} purchase ${transaction_reference}`,
          idempotency_key: `${transaction_reference}_refund`,
          reference_type:  `${service_type}_refund`,
          metadata:        { reference: transaction_reference },
        });
        refundBatchId = refundResult.journal_batch_id;
        console.log(`[ENGINE] Refund issued | ref=${transaction_reference} | batch=${refundBatchId}`);
      } catch (refundErr) {
        console.error(
          `[ENGINE] Refund failed (manual intervention required) | ref=${transaction_reference}:`,
          (refundErr as Error).message
        );
      }
    }

    await updateTransactionStatus(transaction_reference, {
      status:         "failed",
      failure_reason: reason,
      metadata: {
        execution: {
          attempted_providers:    attemptedProviders,
          rejected_providers:     rejectedProviders,
          failover_triggered:     attemptedProviders.length > 1,
          final_provider:         null,
          failure_stage:          "provider_exhausted",
          total_attempts:         attemptedProviders.length,
          all_failed:             true,
          failure_reason:         reason,
          execution_started_at:   executionStartedAt.toISOString(),
          execution_completed_at: executionCompletedAt.toISOString(),
          total_latency_ms:       executionCompletedAt.getTime() - executionStartedAt.getTime(),
        },
        refund: refundBatchId ? { journal_batch_id: refundBatchId } : null,
      },
    });

    await createNotification({
      user_id: transaction.user_id,
      channel: "in_app",
      type:    "purchase_failed",
      title:   "Transaction Failed",
      message: `Your ${service_type} purchase failed and has been refunded.`,
      metadata: {
        reference: transaction_reference,
        type:      service_type,
        amount:    Number(transaction.amount),
      },
    }).catch((err) =>
      console.error("[ENGINE] Failure notification failed (non-fatal):", (err as Error).message)
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private tryGetProvider(providerCode: string): VTUProvider | null {
    try {
      return providerRegistry.getProvider(providerCode);
    } catch {
      return null;
    }
  }

  private idempotentResult(
    success:       boolean,
    finalProvider: string | null = null
  ): ExecuteWithFailoverResult {
    return {
      success,
      provider_result:     null,
      final_provider:      finalProvider,
      attempted_providers: [],
      rejected_providers:  [],
      failover_triggered:  false,
      total_attempts:      0,
      idempotent_replay:   true,
      total_latency_ms:    0,
    };
  }
}

export const providerExecutionEngine = new ProviderExecutionEngine();
