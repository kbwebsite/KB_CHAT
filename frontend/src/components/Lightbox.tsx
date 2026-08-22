import { useState, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from 'lucide-react'

export function Lightbox({ images, startIndex, onClose }: {
  images: { url:string, name:string }[],
  startIndex: number,
  onClose: ()=>void
}) {
  const [idx, setIdx] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const cur = images[idx]

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if (e.key==='Escape') onClose()
      if (e.key==='ArrowLeft') setIdx(i=> (i-1+images.length)%images.length)
      if (e.key==='ArrowRight') setIdx(i=> (i+1)%images.length)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [images.length, onClose])

  if (!cur) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm">{idx+1} / {images.length} — {cur.name}</span>
        <div className="flex items-center gap-2">
          <button onClick={()=> setZoom(z=> Math.max(0.5, z-0.25))} className="p-2 hover:bg-white/10 rounded-full"><ZoomOut className="w-5 h-5"/></button>
          <span className="text-xs w-10 text-center">{Math.round(zoom*100)}%</span>
          <button onClick={()=> setZoom(z=> Math.min(3, z+0.25))} className="p-2 hover:bg-white/10 rounded-full"><ZoomIn className="w-5 h-5"/></button>
          <a href={cur.url} download={cur.name} className="p-2 hover:bg-white/10 rounded-full"><Download className="w-5 h-5"/></a>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative p-4 overflow-hidden">
        <button onClick={()=> setIdx(i=> (i-1+images.length)%images.length)} className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft className="w-6 h-6"/></button>
        <img src={cur.url} alt={cur.name} style={{ transform:`scale(${zoom})` }} className="max-w-full max-h-full object-contain transition-transform select-none" draggable={false} />
        <button onClick={()=> setIdx(i=> (i+1)%images.length)} className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-6 h-6"/></button>
      </div>
    </div>
  )
}
