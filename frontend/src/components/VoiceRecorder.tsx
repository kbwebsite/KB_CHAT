import { useRef, useState } from 'react'
import { Mic, Square, Trash2, Send } from 'lucide-react'

export function VoiceRecorder({ onSend }: { onSend: (blob: Blob, duration:number)=>void }) {
  const [recording, setRecording]=useState(false)
  const [duration, setDuration]=useState(0)
  const [permissionError, setPermissionError]=useState<string|null>(null)
  const mediaRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const timerRef=useRef<any>(null)
  const streamRef=useRef<MediaStream|null>(null)

  const start=async ()=>{
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e=> { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.onstop = ()=>{
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size>0) onSend(blob, duration)
        setRecording(false)
        setDuration(0)
        clearInterval(timerRef.current)
        stream.getTracks().forEach(t=> t.stop())
      }
      mr.start()
      setRecording(true)
      setPermissionError(null)
      timerRef.current = setInterval(()=> setDuration(d=> d+1), 1000)
    } catch (e:any) {
      setPermissionError(e.message || 'Microphone permission denied')
    }
  }

  const stop=()=>{
    mediaRef.current?.stop()
  }
  const cancel=()=>{
    mediaRef.current?.state !== 'inactive' && mediaRef.current?.stop()
    // clear chunks to avoid send
    chunksRef.current = []
    setRecording(false)
    setDuration(0)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t=> t.stop())
    // override onstop to not send - quick hack: recreate
    if (mediaRef.current) mediaRef.current.onstop = null as any
  }

  const fmt=(s:number)=> `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="flex items-center gap-2">
      {!recording ? (
        <button onClick={start} className="p-2.5 rounded-xl hover:bg-muted" title="Record voice"><Mic className="w-5 h-5 text-muted-foreground"/></button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
          <span className="text-xs font-mono">{fmt(duration)}</span>
          <button onClick={cancel} className="p-1 hover:bg-white/10 rounded-full"><Trash2 className="w-4 h-4 text-red-500"/></button>
          <button onClick={stop} className="p-1.5 rounded-full bg-red-500 text-white"><Square className="w-3 h-3"/></button>
        </div>
      )}
      {permissionError && <span className="text-xs text-red-500">{permissionError}</span>}
    </div>
  )
}
