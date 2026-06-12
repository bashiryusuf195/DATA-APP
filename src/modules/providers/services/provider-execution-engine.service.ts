import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { providerRegistry } from "./provider-registry.service";
import { getActiveRoutingRule } from "./provider-routing-rules.service";
import {
  recordProviderAttempt,
  getSuccessfulAttempt,
  getFailedAttemptProviderCodes,
  getPendingAttemptForReference,
} from "./provider-attempts.service";
import { getPlanMappingForProvider } from "./provider-plan-mappings.service";
import { vtuVerifyPendingQueue } from "../../queue/queues/vtu-verify-pending.queue";
import {
  updateTransactionStatus,
  getTransactionByReference,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { sendTransactionPush } from "../../notifications/services/fcm.service";
import {
  recordSuccess as metricsRecordSuccess,
  recordFailure as metricsRecordFailure,
  isCircuitOpen,
} from "./provider-health-metrics.service";
import { classifyError } from "./error-classifier.service";
import { processReferralReward } from "../../referral/services/referral-reward.service";
import { logger } from "../../../lib/logger";
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
  plan_id?:              string | null;
}

export interface RejectedProvider {
  provider_code: string;
  reason:        string;
}

export interface ExecuteWithFailoverResult {
  success:                    boolean;
  /** True when the provider accepted the order but hasn't confirmed delivery yet.
   *  A verification polling job has been enqueued to follow up. */
  pending:                    boolean;
  provider_result:            ProviderPurchaseResult | null;
  final_provider:             string | null;
  attempted_providers:        string[];
  rejected_providers:         RejectedProvider[];
  failover_triggered:         boolean;
  total_attempts:             number;
  idempotent_replay:          boolean;
  total_latency_ms:           number;
  provider_resolution_source: 'plan_override' | 'service_route' | 'priority_fallback' | null;
}

interface ProviderCandidate {
  providerCode:     string;
  provider:         VTUProvider;
  isFailover:       boolean;
  resolutionSource: 'plan_override' | 'service_route' | 'priority_fallback';
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

    logger.info("engine_start", {
      reference:    transaction_reference,
      service_type,
      tx_status:    transaction.status,
    });

    // ── Guard: terminal state ─────────────────────────────────────────────────
    if (transaction.status === "successful" || transaction.status === "failed") {
      logger.info("engine_skip_terminal", {
        reference: transaction_reference,
        status:    transaction.status,
      });
      return this.idempotentResult(transaction.status === "successful");
    }

    // ── Idempotency: successful attempt already recorded ─────────────────────
    //
    // CRITICAL: If a previous BullMQ attempt recorded a successful provider
    // attempt (in provider_attempts) but handleSuccess failed (e.g. DB error),
    // the transaction is stuck at "processing". On this retry, the successful
    // attempt is found and the engine must finalize the transaction NOW rather
    // than returning without updating transaction status.
    const existingSuccess = await getSuccessfulAttempt(transaction_reference);
    if (existingSuccess) {
      logger.info("engine_idempotent_replay", {
        reference: transaction_reference,
        provider:  existingSuccess.provider_code,
      });

      // Re-check live status: if still processing (not finalized), do it now.
      const liveTx = await getTransactionByReference(transaction_reference).catch(() => null);
      if (liveTx && liveTx.status !== "successful" && liveTx.status !== "failed") {
        logger.warn("engine_refinalizing_stuck_processing", {
          reference:    transaction_reference,
          live_status:  liveTx.status,
          provider:     existingSuccess.provider_code,
          reason:       "handleSuccess failed on a previous attempt — re-finalizing",
        });
        await updateTransactionStatus(transaction_reference, {
          status:   "successful",
          provider: existingSuccess.provider_code,
          metadata: { finalized_on_replay: true, replayed_at: new Date().toISOString() },
        });
        // Best-effort idempotent notification
        createNotification({
          user_id:          transaction.user_id,
          channel:          "in_app",
          type:             "purchase_successful",
          title:            "Transaction Successful",
          message:          `Your ${service_type} purchase was successful.`,
          notification_key: `purchase_successful:${transaction_reference}`,
          metadata: {
            reference: transaction_reference,
            type:      service_type,
            amount:    Number(transaction.amount),
            provider:  existingSuccess.provider_code,
          },
        }).catch((err: Error) =>
          logger.warn("engine_replay_notification_failed", { error: err.message })
        );

        sendTransactionPush(transaction.user_id, "purchase_successful", {
          title:             "Transaction Successful",
          body:              `Your ${service_type} purchase was successful.`,
          deep_link:         "/history",
          notification_type: "purchase_successful",
          reference:         transaction_reference,
        }).catch(() => {/* logged inside sendTransactionPush */});
      }

      return this.idempotentResult(true, existingSuccess.provider_code);
    }

    // ── Providers already tried in a previous BullMQ attempt ─────────────────
    const alreadyFailedCodes = await getFailedAttemptProviderCodes(transaction_reference);
    if (alreadyFailedCodes.length > 0) {
      logger.info("engine_skip_previously_failed", {
        reference: transaction_reference,
        skipping:  alreadyFailedCodes,
      });
    }

    // Determine the next attempt number from ALL existing attempts (success or
    // fail) so that a unique constraint on (transaction_reference, attempt_number)
    // is never violated on retries.
    const existingAttemptCount: number = await db("provider_attempts")
      .where({ transaction_reference })
      .count("id as count")
      .first()
      .then((r: Record<string, unknown> | undefined) => Number(r?.count ?? 0))
      .catch(() => 0);

    // ── Resolve ordered provider candidates ───────────────────────────────────
    const { candidates, rejectedProviders } = await this.resolveProviderCandidates(
      service_type,
      new Set(alreadyFailedCodes),
      params.plan_overrides,
    );

    if (candidates.length === 0) {
      const reason = "No eligible providers configured or available";
      logger.warn("engine_no_candidates", {
        reference:   transaction_reference,
        service_type,
        rejected:    rejectedProviders.length,
      });
      await this.handleAllFailed(params, [], rejectedProviders, reason, executionStartedAt, null);
      return {
        success: false, pending: false, provider_result: null, final_provider: null,
        attempted_providers: [], rejected_providers: rejectedProviders,
        failover_triggered: false, total_attempts: 0, idempotent_replay: false,
        total_latency_ms: Date.now() - executionStartedAt.getTime(),
        provider_resolution_source: null,
      };
    }

    // ── Execute with provider-level failover ──────────────────────────────────
    const attemptedProviders: string[]          = [];
    let failoverTriggered                        = false;
    let attemptNumber                            = existingAttemptCount + 1;
    let lastError                                = "All providers exhausted";
    let lastResult: ProviderPurchaseResult | null = null;

    for (const candidate of candidates) {
      const { providerCode, provider, isFailover } = candidate;

      // Resolve per-provider purchase input. Returns null if this provider is
      // blocked by a disabled or loss-protecting mapping — skip without recording
      // a provider attempt so it does not count as an exhausted provider.
      const resolvedInput = await this.resolveInputForProvider(
        purchase_input,
        providerCode,
        params.plan_id,
        Number(transaction.amount),
      );
      if (resolvedInput === null) {
        rejectedProviders.push({ provider_code: providerCode, reason: "MAPPING_BLOCKED" });
        continue;
      }

      if (attemptedProviders.length > 0 || isFailover) failoverTriggered = true;
      attemptedProviders.push(providerCode);

      logger.info("engine_provider_attempt", {
        reference:    transaction_reference,
        provider:     providerCode,
        attempt:      attemptNumber,
        failover:     failoverTriggered,
        service_type,
      });

      const start = Date.now();
      let result: ProviderPurchaseResult | null = null;
      let errorMsg: string | null = null;

      try {
        result = await provider.purchase(resolvedInput);
      } catch (err) {
        errorMsg = (err as Error).message;
        logger.error("engine_provider_threw", {
          reference: transaction_reference,
          provider:  providerCode,
          error:     errorMsg,
        });
      }

      const latencyMs  = Date.now() - start;
      const success    = result?.success === true;
      // Processing: provider accepted the order but delivery is not yet confirmed.
      // Do NOT fail the transaction — enqueue a verification polling job.
      const isPending  = !success && result?.status === "processing";

      logger.info("engine_provider_result", {
        reference:   transaction_reference,
        provider:    providerCode,
        success,
        pending:     isPending,
        status:      result?.status ?? null,
        message:     result?.message ?? errorMsg ?? null,
        latency_ms:  latencyMs,
      });

      // For pending results, don't classify as a hard error so that
      // getFailedAttemptProviderCodes doesn't skip this provider on retry.
      const rawError   = errorMsg ?? (!success && !isPending ? (result?.message ?? null) : null);
      const errorClass = errorMsg
        ? classifyError(errorMsg)
        : isPending
          ? "PENDING"
          : rawError
            ? classifyError(rawError)
            : null;

      const safeRequest: Record<string, unknown> = {
        service_type:   resolvedInput.service_type,
        amount:         resolvedInput.amount,
        variation_code: resolvedInput.variation_code ?? null,
        reference:      resolvedInput.reference,
      };

      // recordProviderAttempt is non-critical: a DB error here must NOT kill
      // the engine and leave the transaction stuck at "processing".
      try {
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
      } catch (recordErr) {
        logger.error("engine_record_attempt_failed_nonfatal", {
          reference: transaction_reference,
          provider:  providerCode,
          error:     (recordErr as Error).message,
        });
        // Continue — the purchase result is what matters, not the audit record.
      }

      // Update circuit breaker metrics (non-critical).
      // Pending is not a failure for circuit-breaker purposes.
      if (success || isPending) {
        metricsRecordSuccess(providerCode).catch((e: Error) =>
          logger.warn("engine_metrics_success_failed", { error: e.message })
        );
      } else {
        metricsRecordFailure(providerCode).catch((e: Error) =>
          logger.warn("engine_metrics_failure_failed", { error: e.message })
        );
      }

      attemptNumber++;

      if (success && result) {
        const totalLatencyMs = Date.now() - executionStartedAt.getTime();
        logger.info("engine_provider_succeeded", {
          reference:  transaction_reference,
          provider:   providerCode,
          latency_ms: latencyMs,
          total_ms:   totalLatencyMs,
          failover:   failoverTriggered,
        });
        await this.handleSuccess(params, result, attemptedProviders, rejectedProviders, failoverTriggered, executionStartedAt, candidate.resolutionSource);
        return {
          success:                    true,
          pending:                    false,
          provider_result:            result,
          final_provider:             providerCode,
          attempted_providers:        attemptedProviders,
          rejected_providers:         rejectedProviders,
          failover_triggered:         failoverTriggered,
          total_attempts:             attemptedProviders.length,
          idempotent_replay:          false,
          total_latency_ms:           totalLatencyMs,
          provider_resolution_source: candidate.resolutionSource,
        };
      }

      if (isPending && result) {
        const totalLatencyMs = Date.now() - executionStartedAt.getTime();
        logger.info("engine_provider_pending", {
          reference:         transaction_reference,
          provider:          providerCode,
          provider_reference: result.provider_reference,
          latency_ms:        latencyMs,
          total_ms:          totalLatencyMs,
        });
        await this.handlePending(params, result, attemptedProviders, rejectedProviders, failoverTriggered, executionStartedAt, candidate.resolutionSource);
        return {
          success:                    false,
          pending:                    true,
          provider_result:            result,
          final_provider:             providerCode,
          attempted_providers:        attemptedProviders,
          rejected_providers:         rejectedProviders,
          failover_triggered:         failoverTriggered,
          total_attempts:             attemptedProviders.length,
          idempotent_replay:          false,
          total_latency_ms:           totalLatencyMs,
          provider_resolution_source: candidate.resolutionSource,
        };
      }

      // Non-retryable errors (invalid phone/meter/smartcard, auth failures, etc.)
      // will produce the same result on every provider — fail fast without failover.
      if (errorClass === "VALIDATION_ERROR") {
        lastError  = rawError ?? `Non-retryable error from provider '${providerCode}'`;
        lastResult = result;
        logger.warn("engine_non_retryable_abort", {
          reference:      transaction_reference,
          provider:       providerCode,
          classification: errorClass,
          reason:         lastError,
        });
        break;
      }

      lastError  = rawError ?? `Provider '${providerCode}' returned failure`;
      lastResult = result;
      logger.warn("engine_provider_failed_trying_next", {
        reference:       transaction_reference,
        provider:        providerCode,
        reason:          lastError,
        classification:  errorClass ?? "unknown",
        latency_ms:      latencyMs,
      });
    }

    // ── All providers exhausted ───────────────────────────────────────────────
    logger.error("engine_all_providers_exhausted", {
      reference:   transaction_reference,
      tried:       attemptedProviders,
      rejected:    rejectedProviders.map((r) => r.provider_code),
      service_type,
    });
    await this.handleAllFailed(params, attemptedProviders, rejectedProviders, lastError, executionStartedAt, lastResult);

    return {
      success:                    false,
      pending:                    false,
      provider_result:            null,
      final_provider:             null,
      attempted_providers:        attemptedProviders,
      rejected_providers:         rejectedProviders,
      failover_triggered:         failoverTriggered,
      total_attempts:             attemptedProviders.length,
      idempotent_replay:          false,
      total_latency_ms:           Date.now() - executionStartedAt.getTime(),
      provider_resolution_source: null,
    };
  }

  // ── Candidate resolution ───────────────────────────────────────────────────
  //
  // Resolution is EXCLUSIVE — exactly one path runs per call, with early return:
  //
  //   Path A — plan_override:   plan.primary_provider_code is set.
  //             Only plan primary + plan fallback are added.
  //             Routing rules and priority-based are NEVER consulted.
  //
  //   Path B — service_route:   No plan override. Active routing rule exists.
  //             Only rule primary + rule fallback are added.
  //             Priority-based is NEVER consulted. If the routed provider is
  //             ineligible (e.g. is_active=false), the purchase fails — it does
  //             not silently fall through to a different provider.
  //
  //   Path C — priority_fallback: No plan override, no active routing rule.
  //             All active eligible providers sorted by priority are added.
  //
  // This ensures the provider selected at runtime matches what the admin
  // configured in the UI (Service Plans / API Routing).

  private async resolveProviderCandidates(
    serviceType:    ProviderServiceType,
    skipCodes:      Set<string>,
    planOverrides?: PlanProviderOverrides,
  ): Promise<{ candidates: ProviderCandidate[]; rejectedProviders: RejectedProvider[] }> {
    const candidates:        ProviderCandidate[] = [];
    const rejectedProviders: RejectedProvider[]  = [];
    const seen = new Set<string>(skipCodes);

    for (const code of skipCodes) {
      rejectedProviders.push({ provider_code: code, reason: "ALREADY_ATTEMPTED" });
    }

    // ── Path A: Plan-level override (exclusive — highest priority) ─────────────
    if (planOverrides?.primary_provider_code) {
      const primary  = planOverrides.primary_provider_code;
      const fallback = planOverrides.fallback_provider_code ?? null;

      logger.info("engine_routing_path_plan_override", {
        service_type: serviceType,
        primary,
        fallback,
      });

      await this.tryAddCandidate(primary, serviceType, false, seen, candidates, rejectedProviders, 'plan_override');
      if (fallback) {
        await this.tryAddCandidate(fallback, serviceType, true, seen, candidates, rejectedProviders, 'plan_override');
      }

      logger.info("engine_routing_resolved", {
        service_type: serviceType,
        path:         'plan_override',
        candidates:   candidates.map((c) => c.providerCode),
        rejected:     rejectedProviders.filter((r) => r.reason !== "ALREADY_ATTEMPTED").map((r) => `${r.provider_code}(${r.reason})`),
      });
      return { candidates, rejectedProviders };
    }

    // ── Path B: Service routing rule (exclusive — no priority fallback) ─────────
    let rule = null;
    try {
      rule = await getActiveRoutingRule(serviceType);
    } catch {
      logger.warn("engine_routing_rule_table_missing", { service_type: serviceType });
    }

    if (rule) {
      logger.info("engine_routing_path_service_rule", {
        service_type: serviceType,
        primary:      rule.primary_provider_code,
        fallback:     rule.fallback_provider_code ?? null,
        rule_id:      rule.id,
      });

      await this.tryAddCandidate(
        rule.primary_provider_code, serviceType, false, seen, candidates, rejectedProviders, 'service_route',
      );
      if (rule.fallback_provider_code) {
        await this.tryAddCandidate(
          rule.fallback_provider_code, serviceType, true, seen, candidates, rejectedProviders, 'service_route',
        );
      }

      // Routing rule is AUTHORITATIVE. Do not add priority-based candidates.
      // If the routed provider is ineligible, the purchase fails rather than
      // silently executing against an unintended provider.
      logger.info("engine_routing_resolved", {
        service_type: serviceType,
        path:         'service_route',
        candidates:   candidates.map((c) => c.providerCode),
        rejected:     rejectedProviders.filter((r) => r.reason !== "ALREADY_ATTEMPTED").map((r) => `${r.provider_code}(${r.reason})`),
      });
      return { candidates, rejectedProviders };
    }

    // ── Path C: Priority-based (only when no routing is configured) ─────────────
    logger.info("engine_routing_path_priority_fallback", {
      service_type: serviceType,
      reason:       "no plan override and no active routing rule",
    });

    const configs = await db("provider_configs")
      .where({ is_active: true })
      .whereRaw("supported_services @> ?::jsonb", [JSON.stringify([serviceType])])
      .whereNot("health_status", "unhealthy")
      .orderBy("priority", "asc");

    for (const config of configs) {
      const code = config.provider_code as string;
      if (seen.has(code)) continue;
      await this.tryAddCandidate(
        code, serviceType, candidates.length > 0, seen, candidates, rejectedProviders, 'priority_fallback',
      );
    }

    logger.info("engine_routing_resolved", {
      service_type: serviceType,
      path:         'priority_fallback',
      candidates:   candidates.map((c) => c.providerCode),
      rejected:     rejectedProviders.filter((r) => r.reason !== "ALREADY_ATTEMPTED").map((r) => `${r.provider_code}(${r.reason})`),
    });
    return { candidates, rejectedProviders };
  }

  private async tryAddCandidate(
    providerCode:      string,
    serviceType:       ProviderServiceType,
    isFailover:        boolean,
    seen:              Set<string>,
    candidates:        ProviderCandidate[],
    rejectedProviders: RejectedProvider[],
    resolutionSource:  ProviderCandidate['resolutionSource'],
  ): Promise<void> {
    if (seen.has(providerCode)) return;

    const circuitOpen = await isCircuitOpen(providerCode).catch(() => false);
    if (circuitOpen) {
      logger.warn("engine_circuit_open", { provider: providerCode });
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

    candidates.push({ providerCode, provider, isFailover, resolutionSource });
    seen.add(providerCode);
  }

  // ── Per-provider input resolution ─────────────────────────────────────────
  //
  // Returns a copy of baseInput with plan-mapping overrides applied for the
  // given provider.  Returns null when the mapping explicitly blocks use of
  // this provider (disabled or loss-protection threshold exceeded), which
  // causes the engine to skip the provider without recording an attempt.

  private async resolveInputForProvider(
    baseInput:    ProviderPurchaseInput,
    providerCode: string,
    planId:       string | null | undefined,
    amount:       number,
  ): Promise<ProviderPurchaseInput | null> {
    if (!planId) return baseInput;

    const mapping = await getPlanMappingForProvider(planId, providerCode).catch(() => null);

    if (!mapping) {
      logger.warn("provider_plan_mapping_missing", { plan_id: planId, provider_code: providerCode });
      return baseInput;
    }

    if (!mapping.enabled) {
      logger.info("engine_mapping_disabled_skip_provider", { plan_id: planId, provider_code: providerCode });
      return null;
    }

    if (
      mapping.provider_cost_price !== null &&
      mapping.provider_cost_price > amount &&
      !mapping.allow_loss_fallback
    ) {
      logger.warn("engine_mapping_loss_protection_skip", {
        plan_id:        planId,
        provider_code:  providerCode,
        provider_cost:  mapping.provider_cost_price,
        customer_price: amount,
      });
      return null;
    }

    return {
      ...baseInput,
      provider_variation_code: mapping.provider_plan_code,
      ...(mapping.provider_operator ? { network_operator: mapping.provider_operator } : {}),
      ...(mapping.provider_category ? { plan_category:    mapping.provider_category } : {}),
    };
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
    executionStartedAt: Date,
    resolutionSource:   ProviderCandidate['resolutionSource'],
  ): Promise<void> {
    const executionCompletedAt = new Date();
    const executionMeta = {
      attempted_providers:        attemptedProviders,
      rejected_providers:         rejectedProviders,
      failover_triggered:         failoverTriggered,
      final_provider:             result.provider,
      failure_stage:              null,
      total_attempts:             attemptedProviders.length,
      all_failed:                 false,
      execution_started_at:       executionStartedAt.toISOString(),
      execution_completed_at:     executionCompletedAt.toISOString(),
      total_latency_ms:           executionCompletedAt.getTime() - executionStartedAt.getTime(),
      provider_resolution_source: resolutionSource,
    };

    logger.info("engine_tx_status_update_starting", {
      reference:    params.transaction_reference,
      service_type: params.service_type,
      new_status:   "successful",
      provider:     result.provider,
    });

    if (result.report_data) {
      logger.info("[SIDV-PORTAL] report_data before db write", {
        reference:            params.transaction_reference,
        report_data_keys:     Object.keys(result.report_data),
        has_portal_pdf_data:  "portal_pdf_data" in result.report_data,
        portal_pdf_length:    typeof result.report_data.portal_pdf_data === "string"
          ? result.report_data.portal_pdf_data.length
          : 0,
      });
    }

    await updateTransactionStatus(params.transaction_reference, {
      status:             "successful",
      provider:           result.provider,
      provider_reference: result.provider_reference,
      metadata: {
        provider_response: result.raw_response ?? null,
        execution:         executionMeta,
        // report_data is populated by identity verification providers only.
        // It contains unmasked fields (incl. photo) needed for PDF generation
        // and is never included in raw_response or logs.
        ...(result.report_data ? { report_data: result.report_data } : {}),
      },
    });

    logger.info("engine_tx_status_update_completed", {
      reference:    params.transaction_reference,
      service_type: params.service_type,
      new_status:   "successful",
    });

    logger.info("engine_transaction_finalized_successful", {
      reference: params.transaction_reference,
      provider:  result.provider,
      latency_ms: executionMeta.total_latency_ms,
    });

    // First-purchase referral reward (fire-and-forget)
    processReferralReward(
      "first_purchase",
      params.transaction.user_id,
      Number(params.transaction.amount)
    ).catch((err) =>
      logger.warn("engine_referral_reward_failed", { error: (err as Error).message })
    );

    createNotification({
      user_id:          params.transaction.user_id,
      channel:          "in_app",
      type:             "purchase_successful",
      title:            "Transaction Successful",
      message:          `Your ${params.service_type} purchase was successful.`,
      notification_key: `purchase_successful:${params.transaction_reference}`,
      metadata: {
        reference: params.transaction_reference,
        type:      params.service_type,
        amount:    Number(params.transaction.amount),
        provider:  result.provider,
      },
    }).catch((err) =>
      logger.warn("engine_success_notification_failed", { error: (err as Error).message })
    );

    sendTransactionPush(params.transaction.user_id, "purchase_successful", {
      title:             "Transaction Successful",
      body:              `Your ${params.service_type} purchase was successful.`,
      deep_link:         "/history",
      notification_type: "purchase_successful",
      reference:         params.transaction_reference,
    }).catch(() => {/* logged inside sendTransactionPush */});
  }

  // ── Pending handler ───────────────────────────────────────────────────────

  private async handlePending(
    params:             ExecuteWithFailoverParams,
    result:             ProviderPurchaseResult,
    attemptedProviders: string[],
    rejectedProviders:  RejectedProvider[],
    failoverTriggered:  boolean,
    executionStartedAt: Date,
    resolutionSource:   ProviderCandidate['resolutionSource'],
  ): Promise<void> {
    const { transaction_reference, service_type, transaction } = params;

    await updateTransactionStatus(transaction_reference, {
      status:             "processing",
      provider:           result.provider,
      provider_reference: result.provider_reference,
      metadata: {
        provider_response: result.raw_response ?? null,
        execution: {
          attempted_providers:        attemptedProviders,
          rejected_providers:         rejectedProviders,
          failover_triggered:         failoverTriggered,
          final_provider:             result.provider,
          pending_at:                 executionStartedAt.toISOString(),
          provider_resolution_source: resolutionSource,
        },
      },
    });

    await vtuVerifyPendingQueue.add(
      "verify_pending",
      {
        reference:             transaction_reference,
        provider_code:         result.provider,
        provider_reference:    result.provider_reference,
        user_id:               transaction.user_id,
        service_type,
        amount:                Number(transaction.amount),
        source_wallet_id:      transaction.source_wallet_id,
        destination_wallet_id: transaction.destination_wallet_id,
        currency:              transaction.currency ?? "NGN",
        attempt_count:         0,
      },
      { delay: 5_000, removeOnComplete: 100, removeOnFail: 500 },
    );

    logger.info("engine_transaction_pending_queued", {
      reference:          transaction_reference,
      provider:           result.provider,
      provider_reference: result.provider_reference,
    });
  }

  // ── All-failed handler ────────────────────────────────────────────────────

  private async handleAllFailed(
    params:             ExecuteWithFailoverParams,
    attemptedProviders: string[],
    rejectedProviders:  RejectedProvider[],
    reason:             string,
    executionStartedAt: Date,
    lastProviderResult: ProviderPurchaseResult | null,
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
        logger.info("engine_refund_issued", {
          reference: transaction_reference,
          batch_id:  refundBatchId,
        });
      } catch (refundErr) {
        logger.error("engine_refund_failed_manual_intervention", {
          reference: transaction_reference,
          error:     (refundErr as Error).message,
        });
      }
    }

    const providerResponse = lastProviderResult?.raw_response
      ? (lastProviderResult.raw_response as Record<string, unknown>)
      : null;

    logger.info("engine_tx_status_update_starting", {
      reference:    transaction_reference,
      service_type,
      new_status:   "failed",
      reason,
    });

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
        provider_response: providerResponse,
        refund: refundBatchId ? { journal_batch_id: refundBatchId } : null,
      },
    });

    logger.info("engine_tx_status_update_completed", {
      reference:    transaction_reference,
      service_type,
      new_status:   "failed",
    });

    logger.info("engine_transaction_finalized_failed", {
      reference:  transaction_reference,
      reason,
      refund_id:  refundBatchId,
    });

    createNotification({
      user_id:          transaction.user_id,
      channel:          "in_app",
      type:             "purchase_failed",
      title:            "Transaction Failed",
      message:          `Your ${service_type} purchase failed and has been refunded.`,
      notification_key: `purchase_failed:${transaction_reference}`,
      metadata: {
        reference: transaction_reference,
        type:      service_type,
        amount:    Number(transaction.amount),
      },
    }).catch((err) =>
      logger.warn("engine_failure_notification_failed", { error: (err as Error).message })
    );

    sendTransactionPush(transaction.user_id, "purchase_failed", {
      title:             "Transaction Failed",
      body:              `Your ${service_type} purchase failed and has been refunded.`,
      deep_link:         "/history",
      notification_type: "purchase_failed",
      reference:         transaction_reference,
    }).catch(() => {/* logged inside sendTransactionPush */});
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
      pending:                    false,
      provider_result:            null,
      final_provider:             finalProvider,
      attempted_providers:        [],
      rejected_providers:         [],
      failover_triggered:         false,
      total_attempts:             0,
      idempotent_replay:          true,
      total_latency_ms:           0,
      provider_resolution_source: null,
    };
  }
}

export const providerExecutionEngine = new ProviderExecutionEngine();
