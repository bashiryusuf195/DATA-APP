import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { providerRegistry } from "./provider-registry.service";
import { getActiveRoutingRule } from "./provider-routing-rules.service";
import {
  recordProviderAttempt,
  getSuccessfulAttempt,
  getFailedAttemptProviderCodes,
} from "./provider-attempts.service";
import { updateTransactionStatus, mergeTransactionMetadata } from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
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

export interface ExecuteWithFailoverParams {
  service_type:          ProviderServiceType;
  purchase_input:        ProviderPurchaseInput;
  transaction_reference: string;
  transaction:           TransactionForExecution;
}

export interface ExecuteWithFailoverResult {
  success:             boolean;
  provider_result:     ProviderPurchaseResult | null;
  final_provider:      string | null;
  attempted_providers: string[];
  failover_triggered:  boolean;
  total_attempts:      number;
  idempotent_replay:   boolean;
}

interface ProviderCandidate {
  providerCode:   string;
  provider:       VTUProvider;
  isFailover:     boolean;
}

// ── Engine ────────────────────────────────────────────────────────────────────

class ProviderExecutionEngine {

  // ── Public API ─────────────────────────────────────────────────────────────

  async executeWithFailover(
    params: ExecuteWithFailoverParams
  ): Promise<ExecuteWithFailoverResult> {
    const { service_type, purchase_input, transaction_reference, transaction } = params;

    const tag = `[ENGINE][${transaction_reference}]`;

    // ── Guard: terminal state (in case of unexpected replay) ─────────────────
    if (transaction.status === "successful" || transaction.status === "failed") {
      console.log(`${tag} Already in terminal state (${transaction.status}) — skipping`);
      return this.idempotentResult(transaction.status === "successful");
    }

    // ── Idempotency: successful provider attempt already recorded ─────────────
    const existingSuccess = await getSuccessfulAttempt(transaction_reference);
    if (existingSuccess) {
      console.log(
        `${tag} Idempotent replay — successful attempt already recorded`,
        `| provider=${existingSuccess.provider_code}`
      );
      return this.idempotentResult(true, existingSuccess.provider_code);
    }

    // ── Providers already tried in a previous BullMQ attempt ──────────────────
    const alreadyFailedCodes = await getFailedAttemptProviderCodes(transaction_reference);
    if (alreadyFailedCodes.length > 0) {
      console.log(`${tag} Skipping previously failed providers:`, alreadyFailedCodes.join(", "));
    }

    // ── Resolve ordered provider candidates ───────────────────────────────────
    const candidates = await this.resolveProviderCandidates(
      service_type,
      new Set(alreadyFailedCodes)
    );

    if (candidates.length === 0) {
      console.warn(`${tag} No eligible providers available for ${service_type}`);
      await this.handleAllFailed(params, [], "No eligible providers configured or available");
      return {
        success: false, provider_result: null, final_provider: null,
        attempted_providers: [], failover_triggered: false, total_attempts: 0, idempotent_replay: false,
      };
    }

    // ── Execute with provider-level failover ──────────────────────────────────
    const attemptedProviders: string[]      = [];
    let failoverTriggered                   = false;
    let attemptNumber                       = alreadyFailedCodes.length + 1;
    let lastError                           = "All providers exhausted";

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

      const start  = Date.now();
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

      // Sanitise request before persisting — strip sensitive fields
      const safeRequest: Record<string, unknown> = {
        service_type:    purchase_input.service_type,
        amount:          purchase_input.amount,
        variation_code:  purchase_input.variation_code ?? null,
        reference:       purchase_input.reference,
      };

      await recordProviderAttempt({
        transaction_reference: transaction_reference,
        provider_code:         providerCode,
        attempt_number:        attemptNumber,
        request_payload:       safeRequest,
        response_payload:      (result?.raw_response as Record<string, unknown>) ?? {},
        success,
        error_message:         errorMsg ?? (result?.success ? null : (result?.message ?? null)),
        latency_ms:            latencyMs,
      });

      attemptNumber++;

      if (success && result) {
        console.log(
          `${tag} Provider '${providerCode}' succeeded`,
          `| latency=${latencyMs}ms`,
          `| failover_triggered=${failoverTriggered}`
        );
        await this.handleSuccess(params, result, attemptedProviders, failoverTriggered);
        return {
          success:             true,
          provider_result:     result,
          final_provider:      providerCode,
          attempted_providers: attemptedProviders,
          failover_triggered:  failoverTriggered,
          total_attempts:      attemptedProviders.length,
          idempotent_replay:   false,
        };
      }

      lastError = errorMsg ?? result?.message ?? `Provider '${providerCode}' returned failure`;
      console.warn(
        `${tag} Provider '${providerCode}' failed — trying next`,
        `| reason=${lastError}`,
        `| latency=${latencyMs}ms`
      );
    }

    // ── All providers exhausted ───────────────────────────────────────────────
    console.error(
      `${tag} All providers exhausted`,
      `| tried=${attemptedProviders.join(", ")}`,
      `| service=${service_type}`
    );
    await this.handleAllFailed(params, attemptedProviders, lastError);

    return {
      success:             false,
      provider_result:     null,
      final_provider:      null,
      attempted_providers: attemptedProviders,
      failover_triggered:  failoverTriggered,
      total_attempts:      attemptedProviders.length,
      idempotent_replay:   false,
    };
  }

  // ── Candidate resolution ───────────────────────────────────────────────────

  private async resolveProviderCandidates(
    serviceType:   ProviderServiceType,
    skipCodes:     Set<string>
  ): Promise<ProviderCandidate[]> {
    const candidates: ProviderCandidate[] = [];
    const seen = new Set<string>(skipCodes);

    // 1. Routing-rule path (primary → fallback)
    let rule = null;
    try {
      rule = await getActiveRoutingRule(serviceType);
    } catch {
      // table missing — fall through to priority-based
    }

    if (rule) {
      const primaryCode = rule.primary_provider_code;
      if (!seen.has(primaryCode)) {
        const provider = this.tryGetProvider(primaryCode);
        if (provider && await this.isProviderEligible(primaryCode, serviceType)) {
          candidates.push({ providerCode: primaryCode, provider, isFailover: false });
          seen.add(primaryCode);
          console.log(`[ENGINE] Routing rule → primary '${primaryCode}' for ${serviceType}`);
        } else {
          console.warn(`[ENGINE] Primary provider '${primaryCode}' ineligible for ${serviceType}`);
        }
      }

      if (rule.fallback_provider_code) {
        const fallbackCode = rule.fallback_provider_code;
        if (!seen.has(fallbackCode)) {
          const provider = this.tryGetProvider(fallbackCode);
          if (provider && await this.isProviderEligible(fallbackCode, serviceType)) {
            candidates.push({ providerCode: fallbackCode, provider, isFailover: true });
            seen.add(fallbackCode);
            console.log(`[ENGINE] Routing rule → fallback '${fallbackCode}' for ${serviceType}`);
          } else {
            console.warn(`[ENGINE] Fallback provider '${fallbackCode}' ineligible for ${serviceType}`);
          }
        }
      }
    }

    // 2. Priority-based path (active + healthy + supports service_type + not already included)
    const configs = await db("provider_configs")
      .where({ is_active: true })
      .whereRaw("supported_services @> ?::jsonb", [JSON.stringify([serviceType])])
      .whereNot("health_status", "unhealthy")
      .orderBy("priority", "asc");

    for (const config of configs) {
      const code = config.provider_code as string;
      if (seen.has(code)) continue;

      const provider = this.tryGetProvider(code);
      if (!provider) continue;

      candidates.push({
        providerCode: code,
        provider,
        isFailover:   candidates.length > 0,
      });
      seen.add(code);
    }

    return candidates;
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
    params:              ExecuteWithFailoverParams,
    result:              ProviderPurchaseResult,
    attemptedProviders:  string[],
    failoverTriggered:   boolean
  ): Promise<void> {
    const executionMeta = {
      attempted_providers: attemptedProviders,
      failover_triggered:  failoverTriggered,
      final_provider:      result.provider,
      total_attempts:      attemptedProviders.length,
      all_failed:          false,
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
    reason:             string
  ): Promise<void> {
    const { transaction_reference, transaction, service_type } = params;

    // Refund if the user's wallet was debited before the worker ran
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
          `[ENGINE] Refund failed (non-fatal — manual intervention required) | ref=${transaction_reference}:`,
          (refundErr as Error).message
        );
      }
    }

    await updateTransactionStatus(transaction_reference, {
      status:         "failed",
      failure_reason: reason,
      metadata: {
        execution: {
          attempted_providers: attemptedProviders,
          failover_triggered:  attemptedProviders.length > 1,
          final_provider:      null,
          total_attempts:      attemptedProviders.length,
          all_failed:          true,
          failure_reason:      reason,
        },
        refund: refundBatchId
          ? { journal_batch_id: refundBatchId }
          : null,
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
      failover_triggered:  false,
      total_attempts:      0,
      idempotent_replay:   true,
    };
  }
}

export const providerExecutionEngine = new ProviderExecutionEngine();
