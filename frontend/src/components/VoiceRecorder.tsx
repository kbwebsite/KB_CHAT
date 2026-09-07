import { useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'

const MAX_VOICE_SECONDS = 300 // matches backend voice_duration cap

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch { /* ignore */ }
  }
  return undefined
}

export function VoiceRecorder({ onSend }: { onSend: (blob: Blob, duration:number)=>void }) {
  const [recording, setRecording]=useState(false)
  const [duration, setDuration]=useState(0)
  const [permissionError, setPermissionError]=useState<string|null>(null)
  const mediaRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const timerRef=useRef<any>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const durationRef=useRef(0)

  const start=async ()=>{
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionError('Microphone not supported in this browser')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      durationRef.current = 0
      mr.ondataavailable = e=> { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.onstop = ()=>{
        const type = mr.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        const finalDuration = durationRef.current
        if (blob.size>0 && finalDuration>0) onSend(blob, finalDuration)
        setRecording(false)
        setDuration(0)
        durationRef.current = 0
        clearInterval(timerRef.current)
        stream.getTracks().forEach(t=> t.stop())
      }
      mr.start()
      setRecording(true)
      setPermissionError(null)
      timerRef.current = setInterval(()=> {
        durationRef.current += 1
        setDuration(durationRef.current)
        if (durationRef.current >= MAX_VOICE_SECONDS) {
          try { mr.state !== 'inactive' && mr.stop() } catch { /* ignore */ }
        }
      }, 1000)
    } catch (e:any) {
      setPermissionError(e.message || 'Microphone permission denied')
    }
  }

  const stop=()=>{
    mediaRef.current?.stop()
  }
  const cancel=()=>{
    if (mediaRef.current) mediaRef.current.onstop = null as any
    try { mediaRef.current?.state !== 'inactive' && mediaRef.current?.stop() } catch { /* ignore */ }
    chunksRef.current = []
    setRecording(false)
    setDuration(0)
    durationRef.current = 0
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t=> t.stop())
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
