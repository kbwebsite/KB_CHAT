/**
 * Session token memory + single-flight refresh (Wave 2 Phase 2).
 *
 * Leaf module: no imports from store/api/websocket, so anyone can use it
 * without cycles. The access JWT lives ONLY here (never localStorage); the
 * refresh token lives in an HttpOnly cookie (web) managed by the browser.
 *
 * Single-flight contract: concurrent callers share ONE refresh request.
 * A generation counter drops stale completions (logout during refresh can
 * never resurrect a token). `silent` mode returns null without firing the
 * auth-failure callback (used by boot init so logged-out visitors on public
 * pages are not bounced).
 */

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null
let generation = 0

type FetchRefresh = () => Promise<string | null>
let fetchRefresh: FetchRefresh = () => Promise.resolve(null)
let onAuthFailure: () => void = () => {}

export function configureSessionAuth(opts: {
  fetchRefresh: FetchRefresh
  onAuthFailure: () => void
}) {
  fetchRefresh = opts.fetchRefresh
  onAuthFailure = opts.onAuthFailure
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(t: string | null) {
  if (t) accessToken = t
  else clearAccessToken()
}

/** Forget the token and invalidate any in-flight refresh. */
export function clearAccessToken() {
  accessToken = null
  refreshPromise = null
  generation += 1
}

export function refreshAccessToken(opts?: { silent?: boolean }): Promise<string | null> {
  const silent = !!opts?.silent
  if (!refreshPromise) {
    const gen = generation
    refreshPromise = fetchRefresh().then(
      (t) => {
        refreshPromise = null
        // A logout (or another clear) happened while we were away: drop it.
        if (gen !== generation) return null
        accessToken = t
        if (!t && !silent) {
          try {
            onAuthFailure()
          } catch {}
        }
        return t
      },
      () => {
        refreshPromise = null
        if (gen === generation && !silent) {
          try {
            onAuthFailure()
          } catch {}
        }
        return null
      }
    )
  }
  return refreshPromise
}
