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
  const isVideo = cur ? /\.(mp4|webm|mov|avi)$/i.test(cur.name) || cur.type?.startsWith('video') : false

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
  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between p-3 text-white border-b border-white/10">
        <span className="text-sm truncate">{idx+1} / {images.length} — {cur.name}</span>
        <div className="flex items-center gap-1">
          {!isVideo && (
            <>
              <button onClick={()=> setZoom(z=> Math.max(0.5, z-0.25))} className="p-2 hover:bg-white/10 rounded-full"><ZoomOut className="w-5 h-5"/></button>
              <span className="text-xs w-10 text-center">{Math.round(zoom*100)}%</span>
              <button onClick={()=> setZoom(z=> Math.min(3, z+0.25))} className="p-2 hover:bg-white/10 rounded-full"><ZoomIn className="w-5 h-5"/></button>
            </>
          )}
          <a href={cur.url} download={cur.name} className="p-2 hover:bg-white/10 rounded-full"><Download className="w-5 h-5"/></a>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative p-2 sm:p-4 overflow-hidden">
        <button onClick={()=> setIdx(i=> (i-1+images.length)%images.length)} className="absolute left-2 sm:left-4 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur z-10"><ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6"/></button>
        {isVideo ? (
          <video src={cur.url} controls autoPlay playsInline className="max-w-full max-h-full rounded-xl shadow-2xl" controlsList="nodownload" />
        ) : (
          <img src={cur.url} alt={cur.name} style={{ transform:`scale(${zoom})` }} className="max-w-full max-h-full object-contain transition-transform select-none rounded-lg shadow-2xl" draggable={false} />
        )}
        <button onClick={()=> setIdx(i=> (i+1)%images.length)} className="absolute right-2 sm:right-4 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur z-10"><ChevronRight className="w-5 h-5 sm:w-6 sm:h-6"/></button>
      </div>
      <div className="p-3 text-center text-xs text-white/50 border-t border-white/10">
        {isVideo ? 'Video • ' : 'Image • '}{cur.name} • Press Esc or Back to close • Arrow keys to navigate
      </div>
    </div>
  )
}
