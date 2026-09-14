import { useEffect, useState } from 'react'

/**
 * Branded cold-start splash: the gold KRIZEN artwork with a light sweep
 * across it and a slim gold loading bar. Fades out on its own; App unmounts
 * it via onDone. Respects prefers-reduced-motion via the global CSS
 * kill-switch in index.css.
 */
export function BootSplash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1950)
    const t2 = setTimeout(onDone, 2450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div className={`boot-overlay ${leaving ? 'boot-leaving' : ''}`} aria-hidden="true">
      <div className="boot-logo-wrap">
        <img src="/krizen-logo.png" alt="" className="boot-logo" draggable={false} />
        <div className="boot-shine" />
      </div>
      <div className="boot-bar">
        <div className="boot-bar-fill" />
      </div>
    </div>
  )
}
