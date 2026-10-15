import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Wraps the Supabase client with a default request timeout and a
 * retry-once-on-timeout policy for READ requests only — docs/03_MasterPrompts.md §3.2.
 *
 * Every Supabase/Edge Function call from Step 5 onward goes through this wrapper,
 * not a raw `supabase.from(...)` call — this is what keeps timeout/retry behavior
 * consistent everywhere instead of reimplemented per screen.
 *
 * CRITICAL: writes/mutations are NEVER auto-retried. A mis-retried dunning send or
 * agent-plan execution would mean a duplicate message reaching a real client — this
 * matters more here than in a typical app (see docs/01_ScopeDocument.md's "no send
 * without validation" architecture principle).
 *
 * NOTE: real Supabase credentials don't exist yet (Step 0's manual account-creation
 * task is still pending) — this file is fully wired and ready, but `getSupabase()`
 * will throw a clear, actionable error if called before `.env.local` is populated
 * (Step 5.3 formally creates the low-level `src/lib/supabase.ts` client re-export;
 * this file's own lazy singleton is what makes that safe to defer without breaking
 * anything built in the meantime, e.g. Step 3's own primitives).
 */

const DEFAULT_TIMEOUT_MS = 15_000
// docs/04_ApplicationFlow.md §4's "Slow network" row: a fetch taking longer
// than ~2-3s shows a "toujours en cours..." inline indicator rather than
// looking frozen. Since every apiRead/apiWrite call funnels through this one
// module, the in-flight-request count is tracked here once and exposed via
// useSlowNetwork() (src/hooks/useSlowNetwork.ts) — no per-call-site wiring
// needed at any of the ~40 call sites across the app.
const SLOW_THRESHOLD_MS = 2_500

let inFlightCount = 0
const slowListeners = new Set<(slow: boolean) => void>()
let slowTimer: ReturnType<typeof setTimeout> | null = null
let isCurrentlySlow = false

function notifySlowListeners(slow: boolean) {
  if (slow === isCurrentlySlow) return
  isCurrentlySlow = slow
  slowListeners.forEach((listener) => listener(slow))
}

function beginRequest() {
  inFlightCount += 1
  if (inFlightCount === 1 && !slowTimer) {
    slowTimer = setTimeout(() => notifySlowListeners(true), SLOW_THRESHOLD_MS)
  }
}

function endRequest() {
  inFlightCount = Math.max(0, inFlightCount - 1)
  if (inFlightCount === 0) {
    if (slowTimer) {
      clearTimeout(slowTimer)
      slowTimer = null
    }
    notifySlowListeners(false)
  }
}

/** Subscribe to "at least one apiRead/apiWrite call has been in flight for
 * longer than SLOW_THRESHOLD_MS" — used by useSlowNetwork(). Not exported
 * directly to screens; go through the hook. */
function subscribeSlowNetwork(listener: (slow: boolean) => void): () => void {
  slowListeners.add(listener)
  return () => slowListeners.delete(listener)
}

let cachedClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured yet: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing from .env.local. ' +
        'Complete Step 0.3 (create the kov-staging Supabase project) and Step 0.6 (populate .env.local) before calling any apiClient function.',
    )
  }

  cachedClient = createClient(url, anonKey)
  return cachedClient
}

class ApiTimeoutError extends Error {
  constructor(message = 'La requête a expiré. Vérifie ta connexion et réessaie.') {
    super(message)
    this.name = 'ApiTimeoutError'
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiTimeoutError()), timeoutMs)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * `withTimeout` above only ever races the real request — on timeout it
 * stops WAITING, but the underlying fetch (and, for an Edge Function call,
 * the server-side work behind it, e.g. a multi-second Claude round-trip)
 * keeps running unseen. Found via a stability audit (2026-10-04): a client-
 * side timeout on agent-plan-generate leaves an orphaned server call that
 * can still finish and insert a plan row late, with nothing tying a user's
 * subsequent manual retry back to it. apiWrite now actually aborts the
 * in-flight request on timeout wherever the caller provides an
 * AbortController, so "the UI gave up" and "the server gave up" are the
 * same event — never used for apiRead (reads retry once already and aborting
 * a read has no correctness downside either way, but there's no need to add
 * signal-plumbing to a path that's already safe to retry).
 */
function makeTimeoutController(timeoutMs: number): {
  controller: AbortController
  clear: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new ApiTimeoutError()), timeoutMs)
  return { controller, clear: () => clearTimeout(timer) }
}

export interface ApiClientOptions {
  /** Override the default 15s timeout for this call. */
  timeoutMs?: number
}

/**
 * Read-only helper: applies the timeout + a single automatic retry on timeout.
 * Use for SELECT queries and other idempotent reads.
 */
export async function apiRead<T>(
  fn: (client: SupabaseClient) => PromiseLike<T>,
  options: ApiClientOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = getSupabase()

  beginRequest()
  try {
    try {
      return await withTimeout(fn(client), timeoutMs)
    } catch (err) {
      if (err instanceof ApiTimeoutError) {
        // Exactly one retry on timeout, reads only — never for writes.
        return await withTimeout(fn(client), timeoutMs)
      }
      throw err
    }
  } finally {
    endRequest()
  }
}

/**
 * Write/mutation helper: applies the timeout but NEVER retries automatically —
 * a timed-out write's server-side outcome is unknown, and blindly retrying could
 * double-send a message or double-create a record. The caller (a screen's explicit
 * "Retry" button, driven by a real user action) decides whether to retry.
 *
 * `fn`'s second argument is a real `AbortSignal` that fires exactly when the
 * timeout does — pass it to `client.functions.invoke(name, { signal, ... })`
 * for any Edge Function call so a client-side give-up genuinely cancels the
 * underlying fetch (see makeTimeoutController's doc comment for why this
 * matters). Call sites that don't need cancellation (plain `.from(...)`
 * table writes, which have no long-running server-side work to orphan) can
 * simply ignore the second argument — fully backward compatible.
 */
export async function apiWrite<T>(
  fn: (client: SupabaseClient, signal: AbortSignal) => PromiseLike<T>,
  options: ApiClientOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = getSupabase()
  const { controller, clear } = makeTimeoutController(timeoutMs)
  beginRequest()
  try {
    const result = await fn(client, controller.signal)
    clear()
    return result
  } catch (err) {
    clear()
    if (controller.signal.aborted) throw new ApiTimeoutError()
    throw err
  } finally {
    endRequest()
  }
}

export { getSupabase, ApiTimeoutError, subscribeSlowNetwork }
