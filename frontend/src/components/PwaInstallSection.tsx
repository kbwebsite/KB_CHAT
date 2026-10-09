import { useEffect, useState } from 'react'
import { Download, Check, Share } from 'lucide-react'
import { installState, type InstallState } from '../utils/pwa'

/** Settings → Install app section body. */
export function PwaInstallSection() {
  const [state, setState] = useState<InstallState>(() => installState())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const refresh = () => setState(installState())
    window.addEventListener('kryzen:installable', refresh)
    window.addEventListener('kryzen:installed', refresh)
    // First paint may precede the browser prompt event.
    refresh()
    return () => {
      window.removeEventListener('kryzen:installable', refresh)
      window.removeEventListener('kryzen:installed', refresh)
    }
  }, [])

  if (state.kind === 'installed') {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
        Running as an installed app — you&apos;re all set.
      </p>
    )
  }

  if (state.kind === 'prompt') {
    const run = async () => {
      setBusy(true)
      try {
        await state.install()
      } finally {
        setBusy(false)
        setState(installState())
      }
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Add Kryzen to your home screen for full-screen chat and faster launches.</p>
        <button
          onClick={run}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {busy ? 'Waiting for browser…' : 'Install app'}
        </button>
      </div>
    )
  }

  if (state.kind === 'ios-manual') {
    return (
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Share className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        On iPhone: tap Share, then &ldquo;Add to Home Screen&rdquo; to install Kryzen.
      </p>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      Install isn&apos;t offered by this browser yet — bookmark this page or try Chrome/Edge on Android or desktop.
    </p>
  )
}
