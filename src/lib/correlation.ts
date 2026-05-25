// src/lib/correlation.ts
//
// AsyncLocalStorage-based request correlation context.
//
// Every HTTP request runs inside correlation.run(), which makes the context
// available anywhere in the call stack without threading it through every
// function signature — including queue jobs, provider calls, and service layers.
//
// Usage:
//   // In middleware (set once per request):
//   correlation.run({ requestId }, () => next());
//
//   // Anywhere in the call stack:
//   const { requestId } = correlation.get() ?? {};
//   correlation.set({ userId: req.user.id });    // patch after auth
//
//   // In queue jobs (pass requestId in job data, restore on pickup):
//   correlation.run({ requestId: job.data.requestId ?? randomUUID() }, () => processor(job));

import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationContext {
  /** Unique ID for this request / job execution — propagated as X-Request-Id. */
  requestId: string;
  /** Authenticated user ID — set after auth middleware resolves. */
  userId?: string;
  /** Active transaction reference — set by purchase / funding controllers. */
  transactionRef?: string;
  /** Provider being called — set by the provider execution engine. */
  providerCode?: string;
}

const _store = new AsyncLocalStorage<CorrelationContext>();

export const correlation = {
  /**
   * Run `fn` inside a new correlation context.
   * The context is automatically propagated to every async operation
   * initiated from within `fn` (Promises, timers, event listeners).
   */
  run<T>(ctx: CorrelationContext, fn: () => T): T {
    return _store.run(ctx, fn);
  },

  /** Get the current context, or undefined if called outside a run(). */
  get(): CorrelationContext | undefined {
    return _store.getStore();
  },

  /** Shorthand: get just the request ID. */
  getRequestId(): string | undefined {
    return _store.getStore()?.requestId;
  },

  /**
   * Patch the current context in-place.
   * Call this after setting req.user (auth middleware) or when entering
   * a provider call so subsequent logs carry the enriched context.
   * No-op if called outside a run().
   */
  set(patch: Partial<Omit<CorrelationContext, 'requestId'>>): void {
    const ctx = _store.getStore();
    if (ctx) Object.assign(ctx, patch);
  },
};
