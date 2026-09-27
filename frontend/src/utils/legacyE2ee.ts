import { useEffect, useState } from 'react'
import nacl from 'tweetnacl'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'

/**
 * READ-ONLY legacy opener for messages sealed before E2EE removal.
 *
 * New messages are always plaintext; this exists only so old sealed rows
 * don't render as base64. It NEVER creates keys: if this device has no
 * stored private key (new device / cleared storage), old messages are
 * simply unopenable here and render a placeholder.
 */

const te = new TextDecoder()

function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function privKeyName(userId: number | string) {
  return `kb_e2ee_priv_${userId}`
}

/** Read this device's stored private key. Null when absent — never creates. */
export function loadStoredPrivateKey(meId: number): Uint8Array | null {
  try {
    const raw = localStorage.getItem(privKeyName(meId))
    if (!raw) return null
    const secretKey = b64ToU8(raw)
    if (secretKey.length !== nacl.box.secretKeyLength) return null
    return secretKey
  } catch {
    return null
  }
}

async function fetchPeerKey(userId: number): Promise<string | null> {
  try {
    const r = await api.get(`/api/users/keys/${userId}`)
    return r?.data?.data?.identity_pubkey ?? null
  } catch {
    return null
  }
}

/** Pure box-open with an explicit secret key (no storage access). */
export function openSealed(
  content: string | null | undefined,
  nonce: string | null | undefined,
  secretKey: Uint8Array,
  otherPubB64: string | null,
): string | null {
  try {
    if (!content || !nonce || !otherPubB64) return null
    const plain = nacl.box.open(
      b64ToU8(content),
      b64ToU8(nonce),
      b64ToU8(otherPubB64),
      secretKey,
    )
    if (!plain) return null
    return te.decode(plain)
  } catch {
    return null
  }
}

async function tryOpen(
  content: string | null | undefined,
  nonce: string | null | undefined,
  meId: number,
  otherPubB64: string | null,
): Promise<string | null> {
  const secretKey = loadStoredPrivateKey(meId)
  if (!secretKey) return null
  return openSealed(content, nonce, secretKey, otherPubB64)
}

export type LegacyDecState =
  | { s: 'na' }
  | { s: 'loading' }
  | { s: 'failed' }
  | { s: 'open'; text: string }

/** Attempt to open a legacy sealed message. Never throws, never writes. */
export function useLegacyDecrypted(msg: {
  id: number
  conversation_id?: number | null
  sender_id?: number | null
  content?: string | null
  nonce?: string | null
  message_type?: string | null
  is_encrypted?: boolean | null
  is_deleted?: boolean | null
}): LegacyDecState {
  const meId = useAuthStore(s => s.user?.id)
  const conv = useChatStore(s =>
    s.conversations.find((c: any) => c.id === msg.conversation_id),
  )
  const [st, setSt] = useState<LegacyDecState>({ s: 'loading' })
  useEffect(() => {
    if (!msg.is_encrypted || msg.message_type !== 'text' || msg.is_deleted) {
      setSt({ s: 'na' })
      return
    }
    if (meId == null) {
      setSt({ s: 'failed' })
      return
    }
    let live = true
    setSt({ s: 'loading' })
    ;(async () => {
      try {
        const members = (conv as any)?.members || []
        let otherId = members.find((m: any) => m.user_id !== meId)?.user_id
        if (otherId == null && msg.sender_id !== meId) otherId = msg.sender_id
        if (otherId == null) {
          if (live) setSt({ s: 'failed' })
          return
        }
        const peerB64 = await fetchPeerKey(otherId)
        if (!live) return
        const t = await tryOpen(msg.content, msg.nonce, meId, peerB64)
        if (live) setSt(t == null ? { s: 'failed' } : { s: 'open', text: t })
      } catch {
        if (live) setSt({ s: 'failed' })
      }
    })()
    return () => {
      live = false
    }
  }, [msg.id, (msg as any).nonce, meId, (conv as any)?.id])
  return st
}
