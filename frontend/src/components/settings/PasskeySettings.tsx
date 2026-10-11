import { useEffect, useState } from 'react'
import { Fingerprint, Plus, Trash2 } from 'lucide-react'
import {
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'
import { passkeyApi } from '../../services/api'

type Passkey = {
  id: number
  label?: string | null
  created_at?: string | null
  last_used_at?: string | null
}

/** Passkey manager: register this device / security key, list, remove. */
export function PasskeySettings() {
  const [keys, setKeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const supported = (() => {
    try {
      return browserSupportsWebAuthn()
    } catch {
      return false
    }
  })()

  const load = () => {
    setLoading(true)
    passkeyApi
      .list()
      .then((r: any) => {
        if (r?.success) {
          setKeys(r.data || [])
          setFailed(false)
        } else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const register = async () => {
    if (busy || !supported) return
    setBusy(true)
    setMsg(null)
    try {
      const opt = await passkeyApi.registerOptions()
      if (!opt?.success) throw new Error(opt?.message || 'Could not start registration')
      const credential = await startRegistration({ optionsJSON: opt.data.options })
      const done = await passkeyApi.registerVerify({
        challenge_id: opt.data.challenge_id,
        credential,
      })
      if (done?.success) {
        setMsg('Passkey registered on this device.')
        load()
      } else throw new Error(done?.message || 'Registration failed')
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') setMsg('Cancelled — no passkey was created.')
      else setMsg(e?.message || 'Registration failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remove this passkey?')) return
    try {
      await passkeyApi.remove(id)
      setKeys((l) => l.filter((k) => k.id !== id))
    } catch {
      setMsg('Could not remove passkey.')
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground mt-1">Checking passkeys…</p>

  return (
    <div className="mt-1 space-y-2">
      {!supported && (
        <p className="text-xs text-muted-foreground">
          This browser doesn&apos;t support passkeys — try Chrome, Edge, Safari or the Android app.
        </p>
      )}
      {failed ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Couldn&apos;t load passkeys.</p>
          <button onClick={load} className="text-xs px-2.5 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted shrink-0">
            Retry
          </button>
        </div>
      ) : keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No passkeys yet. Register one to sign in with fingerprint, face or PIN — no password needed.
        </p>
      ) : (
        <div className="rounded-xl border border-[var(--k-border)] divide-y divide-[var(--k-border)]/40 overflow-hidden">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-2.5 px-3 py-2">
              <Fingerprint className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{k.label || 'Passkey'}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {k.last_used_at ? `Last used ${k.last_used_at.slice(0, 10)}` : 'Never used yet'}
                </p>
              </div>
              <button onClick={() => remove(k.id)} className="p-1.5 rounded-full hover:bg-muted text-destructive" aria-label="Remove passkey">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-xs text-center bg-muted py-1.5 rounded-lg">{msg}</p>}
      <button
        onClick={register}
        disabled={busy || !supported}
        className="w-full py-2 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> {busy ? 'Follow the browser prompt…' : 'Register this device'}
      </button>
    </div>
  )
}
