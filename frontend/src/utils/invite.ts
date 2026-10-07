/**
 * Post-auth destination resume (PE-1).
 *
 * Invite links (/join/:token) and profile links (/u/:username) opened while
 * logged out stash their destination here so signup/login can restore it.
 * Only same-app relative destinations are ever produced — callers pass
 * explicit tokens/usernames, never raw URLs, so open redirects are
 * impossible by construction.
 */

const INVITE_KEY = 'kb_pending_invite'
const PROFILE_KEY = 'kb_pending_profile'

function safeGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function stashPendingInvite(token: string) {
  try {
    if (token && token.trim()) localStorage.setItem(INVITE_KEY, token.trim())
  } catch {}
}

export function stashPendingProfile(username: string) {
  try {
    const u = (username || '').trim().replace(/^@+/, '')
    if (u) localStorage.setItem(PROFILE_KEY, u)
  } catch {}
}

/** Consume + clear pending destination. Invite wins over profile. */
export function takePostAuthDestination(): string | null {
  try {
    const invite = safeGet(INVITE_KEY)
    if (invite) {
      localStorage.removeItem(INVITE_KEY)
      // Token format is server-opaque; still reject path tricks.
      if (/^[A-Za-z0-9_-]+$/.test(invite)) return `/join/${invite}`
    }
    const profile = safeGet(PROFILE_KEY)
    if (profile) {
      localStorage.removeItem(PROFILE_KEY)
      if (/^[A-Za-z0-9_.-]+$/.test(profile)) return `/u/${profile}`
    }
  } catch {}
  return null
}

/** Navigate after auth: pending invite/profile destination wins. */
export function navPostAuth(nav: (to: string) => void, fallback = '/chat') {
  nav(takePostAuthDestination() || fallback)
}

export function hasPendingDestination(): boolean {
  return safeGet(INVITE_KEY) !== null || safeGet(PROFILE_KEY) !== null
}

const DONE_PREFIX = 'kb_onboarded_'

/** First-run flag, per user id. Missing id => treat as done (never trap). */
export function isOnboarded(userId?: number | null): boolean {
  if (!userId) return true
  try {
    return localStorage.getItem(`${DONE_PREFIX}${userId}`) === '1'
  } catch {
    return true
  }
}

export function markOnboarded(userId?: number | null) {
  if (!userId) return
  try {
    localStorage.setItem(`${DONE_PREFIX}${userId}`, '1')
  } catch {}
}
