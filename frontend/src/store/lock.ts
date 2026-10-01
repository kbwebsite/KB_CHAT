import { create } from 'zustand'

/**
 * Device app lock (PIN). Everything lives in localStorage — no backend.
 * The PIN itself is never stored, only its salted SHA-256 hash.
 * Fresh boots start locked whenever the lock is enabled.
 */

const HASH_KEY = 'kb_pin_hash'
const SALT_KEY = 'kb_pin_salt'
const ON_KEY = 'kb_pin_enabled'

export const PIN_RE = /^\d{4,6}$/

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function getSalt(): string {
  let salt = readLS(SALT_KEY)
  if (!salt) {
    try {
      salt = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      localStorage.setItem(SALT_KEY, salt)
    } catch {
      salt = 'kb-fallback-salt'
    }
  }
  return salt
}

function writeLS(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
}

interface LockState {
  /** A PIN hash exists on this device. */
  hasPin: boolean
  /** Lock enforcement on (requires a PIN). */
  enabled: boolean
  /** Unlocked for this session. Always false on fresh boot when enabled. */
  unlocked: boolean
  setupPin: (pin: string) => Promise<void>
  verifyPin: (pin: string) => Promise<boolean>
  setEnabled: (v: boolean) => void
  lock: () => void
  clearPin: () => void
}

const storedHash = readLS(HASH_KEY)
const storedOn = readLS(ON_KEY) === '1' && !!storedHash

export const useLockStore = create<LockState>((set) => ({
  hasPin: !!storedHash,
  enabled: storedOn,
  unlocked: !storedOn,

  setupPin: async (pin: string) => {
    if (!PIN_RE.test(pin)) throw new Error('PIN must be 4–6 digits')
    const hash = await sha256Hex(`${getSalt()}:${pin}`)
    writeLS(HASH_KEY, hash)
    writeLS(ON_KEY, '1')
    set({ hasPin: true, enabled: true, unlocked: true })
  },

  verifyPin: async (pin: string) => {
    const hash = readLS(HASH_KEY)
    if (!hash) return false
    const ok = (await sha256Hex(`${getSalt()}:${pin}`)) === hash
    if (ok) set({ unlocked: true })
    return ok
  },

  setEnabled: (v: boolean) => {
    const has = !!readLS(HASH_KEY)
    if (v && !has) return
    writeLS(ON_KEY, v ? '1' : '0')
    // Toggling mid-session never locks immediately — the change applies
    // from the next boot (or via Lock now / auto-lock).
    set({ enabled: v, unlocked: true })
  },

  lock: () => {
    if (readLS(ON_KEY) === '1' && readLS(HASH_KEY)) set({ unlocked: false })
  },

  clearPin: () => {
    writeLS(HASH_KEY, null)
    writeLS(ON_KEY, null)
    set({ hasPin: false, enabled: false, unlocked: true })
  },
}))
