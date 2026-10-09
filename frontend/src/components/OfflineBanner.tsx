import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/** Connectivity pill: visible only while the browser reports offline. */
export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[150] flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-500 text-black text-sm font-semibold shadow-xl"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <WifiOff className="w-4 h-4" aria-hidden="true" />
      You&apos;re offline — new messages will send on reconnect
    </div>
  )
}
