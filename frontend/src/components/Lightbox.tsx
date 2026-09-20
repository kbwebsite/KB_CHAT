import { useState, useEffect, useRef } from 'react'
import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight, Play, Pause, Volume2, Maximize } from 'lucide-react'

export function Lightbox({ images, startIndex, onClose }: {
  images: { url:string, name:string, type?:string }[],
  startIndex: number,
  onClose: ()=>void
}) {
  const [idx, setIdx] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const cur = images[idx]
  const isVideo = cur ? /\.(mp4|webm|mov|avi|mkv)$/i.test(cur.name) || cur.type?.startsWith('video') : false
  const isPdf = cur ? !isVideo && (/\.pdf$/i.test(cur.name) || (cur.type || '').includes('pdf')) : false

  // Reset zoom when navigating; lock body scroll while the viewer is open.
  useEffect(() => { setZoom(1) }, [idx])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Handle browser back button: push state and close on pop
  useEffect(()=>{
    const state = { viewer: true, idx: startIndex }
    history.pushState(state, '', `#viewer-${startIndex}`)
    const onPop = (e:PopStateEvent)=>{
      onClose()
    }
    window.addEventListener('popstate', onPop)
    return ()=>{
      window.removeEventListener('popstate', onPop)
      // if still open, go back to remove our push
      if (history.state?.viewer) history.back()
    }
  }, [])

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if (e.key==='Escape') {
        // will trigger popstate via history.back() if we pushed
        if (history.state?.viewer) history.back()
        else onClose()
      }
      if (e.key==='ArrowLeft') setIdx(i=> (i-1+images.length)%images.length)
      if (e.key==='ArrowRight') setIdx(i=> (i+1)%images.length)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [images.length, onClose])

  // pinch zoom for mobile
  const lastDistRef = useRef<number|null>(null)
  const handleTouchMove = (e:React.TouchEvent)=>{
    if (e.touches.length===2 && !isVideo) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      if (lastDistRef.current !== null) {
        const delta = dist - lastDistRef.current
        if (Math.abs(delta) > 10) {
          setZoom(z=> Math.min(3, Math.max(0.5, z + delta*0.01)))
          lastDistRef.current = dist
        }
      } else {
        lastDistRef.current = dist
      }
    }
  }
  const handleTouchEnd = ()=>{ lastDistRef.current = null }

  const handleClose=()=>{
    if (history.state?.viewer) history.back()
    else onClose()
  }

  if (!cur) return null
  const multi = images.length > 1
  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col min-h-0" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))] text-white border-b border-white/10 shrink-0">
        <span className="text-sm truncate min-w-0 flex-1">{idx+1} / {images.length} — {cur.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {!isVideo && !isPdf && (
            <>
              <button onClick={()=> setZoom(z=> Math.max(0.5, z-0.25))} className="p-2 hover:bg-white/10 rounded-full" aria-label="Zoom out"><ZoomOut className="w-5 h-5"/></button>
              <span className="text-xs w-10 text-center">{Math.round(zoom*100)}%</span>
              <button onClick={()=> setZoom(z=> Math.min(3, z+0.25))} className="p-2 hover:bg-white/10 rounded-full" aria-label="Zoom in"><ZoomIn className="w-5 h-5"/></button>
            </>
          )}
          <a href={cur.url} download={cur.name} className="p-2 hover:bg-white/10 rounded-full" aria-label="Download"><Download className="w-5 h-5"/></a>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full" aria-label="Close viewer"><X className="w-5 h-5"/></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative p-2 sm:p-4 overflow-hidden min-h-0 min-w-0 w-full">
        {multi && <button onClick={()=> setIdx(i=> (i-1+images.length)%images.length)} className="absolute left-2 sm:left-4 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur z-10" aria-label="Previous"><ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6"/></button>}
        {isVideo ? (
          <video src={cur.url} controls autoPlay playsInline className="w-full max-w-3xl max-h-[70dvh] min-w-0 rounded-xl shadow-2xl bg-black object-contain" controlsList="nodownload" />
        ) : isPdf ? (
          <iframe src={cur.url} title={cur.name} className="w-full max-w-3xl h-[70dvh] sm:h-[78dvh] min-w-0 rounded-xl shadow-2xl bg-white" />
        ) : (
          <img src={cur.url} alt={cur.name} style={{ transform:`scale(${zoom})` }} className="max-w-full max-h-[70dvh] sm:max-h-[78dvh] min-w-0 object-contain transition-transform select-none rounded-lg shadow-2xl" draggable={false} />
        )}
        {multi && <button onClick={()=> setIdx(i=> (i+1)%images.length)} className="absolute right-2 sm:right-4 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur z-10" aria-label="Next"><ChevronRight className="w-5 h-5 sm:w-6 sm:h-6"/></button>}
      </div>
      <div className="p-3 pb-[max(12px,env(safe-area-inset-bottom))] text-center text-xs text-white/50 border-t border-white/10 shrink-0 truncate px-4">
        {isVideo ? 'Video • ' : isPdf ? 'PDF • ' : 'Image • '}{cur.name}
        <span className="hidden sm:inline"> • Press Esc or Back to close • Arrow keys to navigate</span>
        <span className="sm:hidden"> • Tap ✕ or Back to close</span>
      </div>
    </div>
  )
}
