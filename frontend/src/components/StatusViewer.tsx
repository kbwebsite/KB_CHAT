import { useEffect, useState, useRef } from 'react'
import { X, Eye, Reply, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { statusApi, convApi, msgApi } from '../services/api'

export function StatusViewer({ statuses, startIndex, onClose }: { statuses:any[], startIndex:number, onClose:()=>void }) {
  const [idx, setIdx]=useState(startIndex)
  const [paused, setPaused]=useState(false)
  const [progress, setProgress]=useState(0)
  const timerRef=useRef<any>(null)
  const cur=statuses[idx]

  useEffect(()=>{
    if (!cur) return
    setProgress(0)
    if (paused) return
    const duration = cur.media_type==='video' ? 15000 : 5000
    const start=Date.now()
    timerRef.current=setInterval(()=>{
      const elapsed=Date.now()-start
      const p=Math.min(100, (elapsed/duration)*100)
      setProgress(p)
      if (p>=100) {
        clearInterval(timerRef.current)
        if (idx < statuses.length-1) setIdx(i=>i+1)
        else onClose()
      }
    }, 50)
    return ()=> clearInterval(timerRef.current)
  }, [idx, cur, paused])

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if (e.key==='Escape') onClose()
      if (e.key==='ArrowLeft') setIdx(i=> Math.max(0, i-1))
      if (e.key==='ArrowRight') setIdx(i=> Math.min(statuses.length-1, i+1))
      if (e.key===' ') setPaused(p=>!p)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [statuses.length])

  // mark viewed
  useEffect(()=>{
    if (cur && !cur.is_own) statusApi.view(cur.id)
  }, [idx])

  if (!cur) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col fullscreen-modal" onClick={()=> setPaused(!paused)}>
      {/* progress */}
      <div className="flex gap-1 p-2 pt-[max(8px,env(safe-area-inset-top))]">
        {statuses.map((_,i)=> (
          <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all" style={{width: i<idx ? '100%' : i===idx ? `${progress}%` : '0%'}}/>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-muted">
            {cur.avatar_url ? <img src={cur.avatar_url} alt="" className="w-full h-full object-cover"/> : <span className="flex items-center justify-center w-full h-full text-xs">{cur.display_name[0]}</span>}
          </div>
          <div>
            <p className="text-sm font-medium">{cur.display_name}</p>
            <p className="text-xs text-white/60">{new Date(cur.created_at).toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cur.is_own && <span className="text-xs flex items-center gap-1"><Eye className="w-3 h-3"/>{cur.view_count}</span>}
          <button onClick={(e)=>{ e.stopPropagation(); setPaused(!paused)}} className="p-2 hover:bg-white/10 rounded-full">{paused ? <Play className="w-4 h-4"/> : <Pause className="w-4 h-4"/>}</button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative p-4" onClick={e=>e.stopPropagation()}>
        <button onClick={()=> setIdx(i=> Math.max(0,i-1))} className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft className="w-5 h-5"/></button>
        <div className={`max-w-md w-full h-[70vh] rounded-2xl overflow-hidden flex items-center justify-center ${cur.background || 'bg-gradient-to-br from-violet-600 to-indigo-600'}`}>
          {cur.media_type==='text' ? (
            <p className="text-white text-xl font-semibold p-8 text-center break-words">{cur.content}</p>
          ) : cur.media_type==='image' ? (
            <img src={cur.media_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <video src={cur.media_url} controls autoPlay playsInline className="w-full h-full object-contain" />
          )}
        </div>
        <button onClick={()=> setIdx(i=> Math.min(statuses.length-1,i+1))} className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-5 h-5"/></button>
      </div>

      <div className="p-4 flex gap-2">
        <input placeholder="Reply..." className="flex-1 px-4 py-2.5 rounded-full bg-white/10 text-white placeholder:text-white/50 outline-none border border-white/10" onKeyDown={e=>{ if(e.key==='Enter'){ const t=(e.target as HTMLInputElement).value; if(t.trim()){ convApi.create({ type:'direct', participant_id:cur.user_id }).then(c=>{ msgApi.send(c.id, { content:t.trim() }); (e.target as HTMLInputElement).value='' }).catch(()=>{}) }}}} />
        <button className="p-3 rounded-full bg-white text-black"><Reply className="w-4 h-4"/></button>
      </div>
    </div>
  )
}
