// src/modules/backup/workers/integrity.worker.ts
//
// Daily integrity verification worker.
//
// Runs at 02:00 AM every day (cron: "0 2 * * *").
// Executes all 5 integrity checks and stores the results in integrity_reports.
// Emits structured alerts for critical issues (negative balances, duplicate
// provider references) via errorReporter so external services (Sentry,
// BetterStack) can page on-call engineers.

import { createQueue, createWorker, defaultJobOptions } from '../../queue/config/queue.config';
import { runAllIntegrityChecks, saveIntegrityReport }   from '../services/integrity-check.service';
import { logger }       from '../../../lib/logger';
import { errorReporter } from '../../../lib/error-reporter';

const QUEUE_NAME = 'integrity-checks';

export const integrityQueue  = createQueue(QUEUE_NAME);
export const integrityWorker = createWorker(QUEUE_NAME, async (job) => {
  const triggeredBy = (job.data as { triggered_by?: string }).triggered_by ?? 'scheduler';

  logger.info('integrity_worker_start', {
    job_id:       job.id,
    triggered_by: triggeredBy,
    attempt:      job.attemptsMade,
  });

  const report   = await runAllIntegrityChecks();
  const reportId = await saveIntegrityReport(report, triggeredBy === 'scheduler' ? 'system' : triggeredBy);

  if (report.critical_issues > 0) {
    errorReporter.captureMessage('daily_integrity_critical_issues', 'error', {
      report_id:       reportId,
      critical_issues: report.critical_issues,
      total_issues:    report.total_issues,
      negative_balances: report.negative_balances.issue_count,
      duplicate_refs:    report.duplicate_provider_refs.issue_count,
    });
  }

  return { reportId, totalIssues: report.total_issues, criticalIssues: report.critical_issues };
});

integrityWorker.on('completed', (job) => {
  const val = job.returnvalue as { reportId?: string; totalIssues?: number; criticalIssues?: number } | undefined;
  logger.info('integrity_worker_completed', {
    job_id:          job.id,
    report_id:       val?.reportId ?? 'unknown',
    total_issues:    val?.totalIssues ?? 0,
    critical_issues: val?.criticalIssues ?? 0,
  });
});

integrityWorker.on('failed', (job, err) => {
  logger.error('integrity_worker_failed', {
    job_id:  job?.id ?? 'unknown',
    attempt: job?.attemptsMade ?? '?',
    error:   err.message,
  });
  errorReporter.captureError(err, { errorCategory: 'queue_error' });
});

// Register the daily repeating job at 02:00 AM.
// BullMQ deduplicates repeating jobs by name + options — safe to re-register on restart.
integrityQueue
  .add(
    'daily_integrity_check',
    { triggered_by: 'scheduler' },
    { ...defaultJobOptions, attempts: 1, repeat: { pattern: '0 2 * * *' } },
  )
  .catch((err: Error) => {
    console.error('[INTEGRITY] Failed to register daily job:', err.message);
  });
