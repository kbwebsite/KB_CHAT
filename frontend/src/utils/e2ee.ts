import nacl from 'tweetnacl'
import api from '../services/api'

/**
 * E2EE v1 — NaCl box for 1-1 text chats.
 *
 * - Each device holds an X25519 identity keypair. The private half lives ONLY
 *   in this browser's localStorage; the server stores just the public half.
 * - Messages are sealed with (senderPriv, recipientPub) + a fresh random
 *   24-byte nonce, so both sides can open them with (senderPub, ownPriv).
 * - Server is a blind courier: it validates envelope *format*, never keys.
 *
 * v1 limits (documented, not silent): 1-1 text only (no groups/media),
 * no forward secrecy, keys are per-device (new device = new key; old
 * messages stay readable only on the original device).
 */

const te = new TextEncoder()
const td = new TextDecoder()

export function u8ToB64(u8: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)) as any)
  }
  return btoa(s)
}

export function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function privKeyName(userId: number | string) {
  return `kb_e2ee_priv_${userId}`
}

export interface DeviceKeys {
  publicKey: Uint8Array
  secretKey: Uint8Array
  publicB64: string
}

/** Load (or create) this device's identity keypair. */
export function loadDeviceKeys(userId: number): DeviceKeys {
  const name = privKeyName(userId)
  try {
    const raw = localStorage.getItem(name)
    if (raw) {
      const secretKey = b64ToU8(raw)
      if (secretKey.length === nacl.box.secretKeyLength) {
        const kp = nacl.box.keyPair.fromSecretKey(secretKey)
        return { publicKey: kp.publicKey, secretKey, publicB64: u8ToB64(kp.publicKey) }
      }
    }
  } catch { /* corrupted entry -> regenerate below */ }
  const kp = nacl.box.keyPair()
  try {
    localStorage.setItem(name, u8ToB64(kp.secretKey))
  } catch { /* private mode: keys live for this session only */ }
  return { publicKey: kp.publicKey, secretKey: kp.secretKey, publicB64: u8ToB64(kp.publicKey) }
}

/** Publish our public key if the server has none (or a different one). */
export async function ensurePublished(userId: number): Promise<string | null> {
  try {
    const keys = loadDeviceKeys(userId)
    let serverPub: string | null = null
    try {
      const r = await api.get(`/api/users/keys/${userId}`)
      serverPub = r?.data?.data?.identity_pubkey ?? null
    } catch { serverPub = null }
    if (serverPub !== keys.publicB64) {
      await api.patch('/api/users/me/keys', { identity_pubkey: keys.publicB64 })
    }
    return keys.publicB64
  } catch {
    return null
  }
}

const peerCache = new Map<number, string | null>()

/** Fetch + cache a peer's public key (null = no key / unreachable). */
export async function fetchPeerKey(userId: number): Promise<string | null> {
  if (peerCache.has(userId)) return peerCache.get(userId) ?? null
  try {
    const r = await api.get(`/api/users/keys/${userId}`)
    const pub = r?.data?.data?.identity_pubkey ?? null
    peerCache.set(userId, pub)
    return pub
  } catch {
    peerCache.set(userId, null)
    return null
  }
}

export function peerKeyCached(userId: number): boolean {
  return (peerCache.get(userId) ?? null) !== null
}

export interface Sealed {
  content: string
  nonce: string
}

/**
 * Seal plaintext for a 1-1 conversation. Returns null when E2EE does not
 * apply (group chat, attachments, missing keys) — caller sends plaintext.
 */
export async function sealForConversation(
  conv: { is_group?: boolean; members?: { user_id: number }[] } | null,
  meId: number,
  text: string,
): Promise<Sealed | null> {
  try {
    if (!conv || conv.is_group) return null
    const other = (conv.members || []).find(m => m.user_id !== meId)
    if (!other) return null
    const peerB64 = await fetchPeerKey(other.user_id)
    if (!peerB64) return null
    const keys = loadDeviceKeys(meId)
    const nonce = nacl.randomBytes(nacl.box.nonceLength)
    const box = nacl.box(te.encode(text), nonce, b64ToU8(peerB64), keys.secretKey)
    if (!box) return null
    return { content: u8ToB64(box), nonce: u8ToB64(nonce) }
  } catch {
    return null
  }
}

/**
 * Open an encrypted message. Returns the plaintext, or null when it cannot
 * be decrypted on this device (wrong/new device, corrupt envelope).
 */
export async function openMessage(
  msg: { content?: string | null; nonce?: string | null; sender_id?: number | null },
  meId: number,
): Promise<string | null> {
  try {
    if (!msg.content || !msg.nonce || msg.sender_id == null) return null
    const keys = loadDeviceKeys(meId)
    let senderPub: Uint8Array
    if (msg.sender_id === meId) {
      senderPub = keys.publicKey
    } else {
      const b64 = await fetchPeerKey(msg.sender_id)
      if (!b64) return null
      senderPub = b64ToU8(b64)
    }
    const plain = nacl.box.open(
      b64ToU8(msg.content), b64ToU8(msg.nonce), senderPub, keys.secretKey,
    )
    if (!plain) return null
    return td.decode(plain)
  } catch {
    return null
  }
}
