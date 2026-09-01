import { useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'

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
    chunksRef.current = []
    setRecording(false)
    setDuration(0)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t=> t.stop())
    if (mediaRef.current) mediaRef.current.onstop = null as any
  }

  const fmt=(s:number)=> `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="flex items-center gap-2">
      {!recording ? (
        <button onClick={start} className="composer-action-btn" title="Record voice" aria-label="Record voice message">
          <Mic className="w-5 h-5" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
          <span className="text-xs font-mono" style={{ color: 'var(--error)' }}>{fmt(duration)}</span>
          <button onClick={cancel} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Cancel recording">
            <Trash2 className="w-4 h-4 text-red-500"/>
          </button>
          <button onClick={stop} className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500 text-white" aria-label="Stop and send recording">
            <Square className="w-3.5 h-3.5"/>
          </button>
        </div>
      )}
      {permissionError && <span className="text-xs" style={{ color: 'var(--error)' }}>{permissionError}</span>}
    </div>
  )
}
