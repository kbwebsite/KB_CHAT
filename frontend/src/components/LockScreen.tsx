import { useState } from 'react'
import { Check, Delete, LogOut } from 'lucide-react'
import { useLockStore, PIN_RE } from '../store/lock'

/** Full-screen PIN gate shown instead of the app while locked. */
export function LockScreen() {
  const verifyPin = useLockStore((s) => s.verifyPin)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)

  const press = (d: string) => {
    if (busy) return
    setError(null)
    const next = (pin + d).slice(0, 6)
    setPin(next)
    // Auto-submit at max length; shorter PINs use the check button.
    if (next.length >= 6) void tryUnlock(next)
  }

  const back = () => {
    setError(null)
    setPin((p) => p.slice(0, -1))
  }

  const tryUnlock = async (candidate: string) => {
    setBusy(true)
    try {
      const ok = await verifyPin(candidate)
      if (ok) {
        setPin('')
      } else {
        setError('Wrong PIN — try again')
        setShake((n) => n + 1)
        setPin('')
      }
    } finally {
      setBusy(false)
    }
  }

  const resetApp = () => {
    if (!confirm('Forgot your PIN? This signs you out and removes the app lock from this device.')) return
    try {
      localStorage.removeItem('kb_token')
      localStorage.removeItem('kb_pin_hash')
      localStorage.removeItem('kb_pin_salt')
      localStorage.removeItem('kb_pin_enabled')
    } catch {}
    window.location.href = '/login'
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-25 blur-3xl kryzen-accent-gradient" />
      </div>
      <div className="relative flex flex-col items-center w-full max-w-xs">
        <div className="w-16 h-16 rounded-3xl kryzen-accent-gradient flex items-center justify-center text-white font-bold text-2xl shadow-lg kryzen-accent-glow">
          K
        </div>
        <h1 className="mt-4 text-lg font-bold tracking-tight">Kryzen is locked</h1>
        <p className="text-xs text-muted-foreground mt-1">Enter your PIN to continue</p>

        <div key={shake} className={`flex gap-3 mt-6 ${shake ? 'animate-[kryzen-fx-shake_0.4s_ease-in-out]' : ''}`} aria-label="PIN dots">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                pin.length > i ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/40'
              }`}
            />
          ))}
        </div>
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
        {!PIN_RE.test(pin) && pin.length > 0 && pin.length < 4 && (
          <p className="text-[11px] text-muted-foreground mt-3">Keep typing…</p>
        )}

        <div className="grid grid-cols-3 gap-3 mt-6 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              disabled={busy}
              className="h-16 rounded-2xl bg-muted hover:bg-accent text-xl font-semibold transition active:scale-95 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => pin.length >= 4 && void tryUnlock(pin)}
            disabled={busy || pin.length < 4}
            className="h-16 rounded-2xl btn-gradient font-semibold transition active:scale-95 disabled:opacity-40 flex items-center justify-center"
            aria-label="Unlock"
          >
            <Check className="w-6 h-6" />
          </button>
          <button
            onClick={() => press('0')}
            disabled={busy}
            className="h-16 rounded-2xl bg-muted hover:bg-accent text-xl font-semibold transition active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={back}
            disabled={busy || pin.length === 0}
            className="h-16 rounded-2xl bg-muted hover:bg-accent transition active:scale-95 disabled:opacity-40 flex items-center justify-center"
            aria-label="Backspace"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={resetApp}
          className="mt-8 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Forgot PIN? Reset app
        </button>
      </div>
    </div>
  )
}
