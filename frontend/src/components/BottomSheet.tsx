import { useEffect, useRef } from 'react'
import { shouldDismissSwipe, useEscapeKey } from '../hooks/useDismiss'

interface BottomSheetProps {
  open: boolean
  onClose: ()=>void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ y: number; t: number } | null>(null)
  const historyPushed = useRef(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEscapeKey(onClose, open)

  // Move focus into the sheet when it opens (screen-reader/keyboard users
  // land on the dismiss control, not behind the overlay).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        try {
          closeRef.current?.focus()
        } catch {}
      }, 60)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(()=>{
    if (open) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return ()=> document.body.classList.remove('modal-open')
  }, [open])

  // Swipe down to dismiss — gesture starts ONLY on the handle / title
  // chrome ([data-sheet-chrome]), never inside scrollable content, so list
  // scrolling, inputs and sliders are untouched. Dismissal needs either a
  // long deliberate drag (>120px) or a shorter flick with velocity (>40px
  // at >0.5px/ms). Small accidental movements never dismiss.
  const onTouchStart = (e: React.TouchEvent)=>{
    const el = e.target as HTMLElement
    if (!el.closest?.('[data-sheet-chrome]')) {
      gesture.current = null
      return
    }
    gesture.current = { y: e.touches[0].clientY, t: performance.now() }
  }
  const onTouchEnd = (e: React.TouchEvent)=>{
    const g = gesture.current
    gesture.current = null
    if (!g || e.changedTouches.length === 0) return
    const dy = e.changedTouches[0].clientY - g.y
    if (shouldDismissSwipe(dy, performance.now() - g.t)) onClose()
  }

  // Back button support — push history entry when opened, pop on close
  useEffect(()=>{
    if (open && !historyPushed.current) {
      historyPushed.current = true
      window.history.pushState({ bottomSheet: true }, '')
      const handler = ()=> {
        historyPushed.current = false
        onClose()
      }
      window.addEventListener('popstate', handler)
      return ()=> {
        window.removeEventListener('popstate', handler)
        // If component unmounts while open, clean up history state
        if (historyPushed.current) {
          historyPushed.current = false
        }
      }
    } else if (!open) {
      historyPushed.current = false
    }
  }, [open, onClose])

  return (
    <>
      <div className={`bottom-sheet-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`bottom-sheet ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Actions'}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="bottom-sheet-handle" data-sheet-chrome style={{ touchAction: 'none' }} />
        {title && (
          <div data-sheet-chrome className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">{title}</h3>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="text-sm text-muted-foreground px-2 min-h-[44px] min-w-[44px] flex items-center justify-center">Done</button>
          </div>
        )}
        <div className="px-2 py-2">
          {children}
        </div>
      </div>
    </>
  )
}

// Bottom sheet action item
export function BottomSheetAction({ icon, label, onClick, destructive }: {
  icon?: React.ReactNode
  label: string
  onClick: ()=>void
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium active:bg-muted transition-colors ${destructive ? 'text-destructive' : ''}`}
    >
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      {label}
    </button>
  )
}
