// src/modules/alerts/services/admin-alert.service.ts
//
// Central service for the five admin alert types.
// Each function:
//   1. Checks a DB-backed cooldown (prevents duplicate alerts within the window)
//   2. Inserts a row into admin_alerts (persists the alert for the UI)
//   3. Fires a push notification via the existing FCM pipeline
//
// All functions are fully non-throwing — errors are only logged so a broken
// alert path can never cascade into a transaction failure.

import { getDbInstance }                                        from '../../../db/knex';
import { checkAndUpdateCooldown, sendAdminPushNotification }   from '../../notifications/services/admin-push.service';
import { logger }                                               from '../../../lib/logger';

const db = getDbInstance();

// ── Thresholds (override via env vars) ───────────────────────────────────────
export const LARGE_TX_THRESHOLD_NGN  = parseFloat(process.env.ALERT_LARGE_TRANSACTION_NGN ?? '50000');
export const FAILURE_THRESHOLD       = parseInt(process.env.ALERT_REPEATED_FAILURES_THRESHOLD ?? '5', 10);
export const FAILURE_WINDOW_MINUTES  = parseInt(process.env.ALERT_REPEATED_FAILURES_WINDOW_MINUTES ?? '60', 10);

// Low-balance keywords from provider error messages
const LOW_BALANCE_PATTERNS = ['insufficient', 'low balance', 'wallet balance', 'credit your'];

export function isLowBalanceError(message: string): boolean {
  const lower = message.toLowerCase();
  return LOW_BALANCE_PATTERNS.some((p) => lower.includes(p));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type Severity = 'info' | 'warning' | 'critical';

async function createAlert(alert: {
  type:     string;
  severity: Severity;
  category: string;
  title:    string;
  message:  string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await db('admin_alerts').insert({
    type:       alert.type,
    severity:   alert.severity,
    category:   alert.category,
    title:      alert.title,
    message:    alert.message,
    metadata:   JSON.stringify(alert.metadata),
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ── 1. Provider down ──────────────────────────────────────────────────────────

export async function alertProviderDown(
  providerCode:        string,
  consecutiveFailures: number,
): Promise<void> {
  const ok = await checkAndUpdateCooldown('alert_provider_down', providerCode, 30).catch(() => false);
  if (!ok) return;

  try {
    await createAlert({
      type:     'provider_down',
      severity: 'critical',
      category: 'provider',
      title:    `Provider Down: ${providerCode}`,
      message:  `${providerCode} has ${consecutiveFailures} consecutive failures. Circuit breaker is open — purchases via this provider will fail until it recovers.`,
      metadata: { provider_code: providerCode, consecutive_failures: consecutiveFailures },
    });

    void sendAdminPushNotification({
      title:             'Provider Down',
      body:              `${providerCode} circuit open after ${consecutiveFailures} failures`,
      deep_link:         '/operations/provider-health',
      notification_type: 'admin_provider_alert',
      preference_key:    'admin_provider_alerts',
      metadata:          { provider_code: providerCode, consecutive_failures: String(consecutiveFailures) },
    }).catch(() => {});
  } catch (err) {
    logger.warn('admin_alert_provider_down_failed', { provider_code: providerCode, error: (err as Error).message });
  }
}

// ── 2. Provider wallet low ────────────────────────────────────────────────────

export async function alertProviderWalletLow(
  providerCode:  string,
  errorMessage:  string,
): Promise<void> {
  const ok = await checkAndUpdateCooldown('alert_wallet_low', providerCode, 60).catch(() => false);
  if (!ok) return;

  try {
    await createAlert({
      type:     'wallet_low',
      severity: 'warning',
      category: 'provider',
      title:    `Provider Wallet Low: ${providerCode}`,
      message:  `${providerCode} reported a balance error: "${errorMessage}". Top up the provider wallet to restore service.`,
      metadata: { provider_code: providerCode, error_message: errorMessage },
    });

    void sendAdminPushNotification({
      title:             'Provider Wallet Low',
      body:              `${providerCode} balance is low — purchases may fail`,
      deep_link:         '/provider-wallets',
      notification_type: 'admin_provider_alert',
      preference_key:    'admin_provider_alerts',
      metadata:          { provider_code: providerCode },
    }).catch(() => {});
  } catch (err) {
    logger.warn('admin_alert_wallet_low_failed', { provider_code: providerCode, error: (err as Error).message });
  }
}

// ── 3. Payment gateway down ───────────────────────────────────────────────────

export async function alertGatewayDown(
  gateway:      string,
  reference:    string,
  errorMessage: string,
): Promise<void> {
  const ok = await checkAndUpdateCooldown('alert_gateway_down', gateway, 30).catch(() => false);
  if (!ok) return;

  try {
    await createAlert({
      type:     'gateway_down',
      severity: 'critical',
      category: 'payment',
      title:    `Payment Gateway Error: ${gateway}`,
      message:  `${gateway} failed to process payment ${reference} after all retries: "${errorMessage}". Users may not be receiving wallet credits — manual reconciliation may be needed.`,
      metadata: { gateway, reference, error_message: errorMessage },
    });

    void sendAdminPushNotification({
      title:             'Payment Gateway Error',
      body:              `${gateway} failed on ${reference} — check webhook events`,
      deep_link:         '/operations/webhooks',
      notification_type: 'admin_payment_alert',
      preference_key:    'admin_payment_alerts',
      metadata:          { gateway, reference },
    }).catch(() => {});
  } catch (err) {
    logger.warn('admin_alert_gateway_down_failed', { gateway, error: (err as Error).message });
  }
}

// ── 4. Large transaction ──────────────────────────────────────────────────────

export async function alertLargeTransaction(
  userId:    string,
  amount:    number,
  type:      string,
  reference: string,
): Promise<void> {
  try {
    await createAlert({
      type:     'large_transaction',
      severity: 'warning',
      category: 'transaction',
      title:    `Large Transaction: ₦${amount.toLocaleString('en-NG')}`,
      message:  `A ${type} transaction of ₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} was processed (ref: ${reference}).`,
      metadata: { user_id: userId, amount, transaction_type: type, reference },
    });

    void sendAdminPushNotification({
      title:             'Large Transaction',
      body:              `₦${amount.toLocaleString('en-NG')} — ${type} (${reference})`,
      deep_link:         '/transactions',
      notification_type: 'admin_transaction_failure',
      preference_key:    'admin_transaction_failures',
      metadata:          { user_id: userId, amount: String(amount), reference },
    }).catch(() => {});
  } catch (err) {
    logger.warn('admin_alert_large_tx_failed', { reference, error: (err as Error).message });
  }
}

// ── 5. Repeated failed purchases ──────────────────────────────────────────────

export async function alertRepeatedFailures(
  userId:        string,
  count:         number,
  windowMinutes: number,
): Promise<void> {
  const ok = await checkAndUpdateCooldown('alert_repeated_failures', userId, 60).catch(() => false);
  if (!ok) return;

  try {
    await createAlert({
      type:     'repeated_failures',
      severity: 'warning',
      category: 'transaction',
      title:    'Repeated Purchase Failures',
      message:  `A user has had ${count} failed purchases in the last ${windowMinutes} minutes. This may indicate a payment issue or suspicious activity.`,
      metadata: { user_id: userId, failure_count: count, window_minutes: windowMinutes },
    });

    void sendAdminPushNotification({
      title:             'Repeated Purchase Failures',
      body:              `${count} failed purchases from one user in ${windowMinutes} min`,
      deep_link:         '/transactions',
      notification_type: 'admin_transaction_failure',
      preference_key:    'admin_transaction_failures',
      metadata:          { user_id: userId, count: String(count) },
    }).catch(() => {});
  } catch (err) {
    logger.warn('admin_alert_repeated_failures_failed', { user_id: userId, error: (err as Error).message });
  }
}

// ── Helper: check repeated-failure threshold ──────────────────────────────────

export async function checkAndAlertRepeatedFailures(userId: string): Promise<void> {
  try {
    const row = await db('transactions')
      .where({ user_id: userId, status: 'failed' })
      .whereRaw(`created_at > NOW() - INTERVAL '${FAILURE_WINDOW_MINUTES} minutes'`)
      .whereNot('type', 'wallet_funding')
      .count('id as count')
      .first<{ count: string }>();

    const count = parseInt(row?.count ?? '0', 10);
    if (count >= FAILURE_THRESHOLD) {
      await alertRepeatedFailures(userId, count, FAILURE_WINDOW_MINUTES);
    }
  } catch (err) {
    logger.warn('repeated_failures_check_failed', { user_id: userId, error: (err as Error).message });
  }
}
