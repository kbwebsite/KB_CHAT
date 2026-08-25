import { useEffect, useRef } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: ()=>void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)

  useEffect(()=>{
    if (open) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return ()=> document.body.classList.remove('modal-open')
  }, [open])

  // Swipe down to dismiss
  const onTouchStart = (e: React.TouchEvent)=>{
    startY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: React.TouchEvent)=>{
    const dy = e.changedTouches[0].clientY - startY.current
    if (dy > 80) onClose()
  }

  // Back button support
  useEffect(()=>{
    if (!open) return
    const handler = ()=> onClose()
    window.history.pushState({ bottomSheet: true }, '')
    window.addEventListener('popstate', handler)
    return ()=> window.removeEventListener('popstate', handler)
  }, [open])

  return (
    <>
      <div className={`bottom-sheet-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`bottom-sheet ${open ? 'open' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="bottom-sheet-handle" />
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">{title}</h3>
            <button onClick={onClose} className="text-sm text-muted-foreground px-2 py-1">Done</button>
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
