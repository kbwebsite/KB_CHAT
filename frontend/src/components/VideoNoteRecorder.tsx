import { useEffect, useRef, useState } from 'react'
import { X, RefreshCw, SwitchCamera, Send, Square } from 'lucide-react'

const MAX_SECONDS = 60

function pickMime(): string {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  try {
    for (const m of cands) {
      if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported?.(m)) return m
    }
  } catch {}
  return ''
}

/** Round video messages (Telegram-style video notes): front camera default,
 * tap to record up to 60s, review in the circle, send. Parent uploads. */
export function VideoNoteRecorder({ onClose, onSend }: { onClose: () => void; onSend: (blob: Blob, duration: number) => void }) {
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [reviewUrl, setReviewUrl] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)

  const liveRef = useRef<HTMLVideoElement>(null)
  const reviewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startAtRef = useRef(0)
  const durationRef = useRef(0)

  // (Re)start the camera whenever the facing mode changes.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(null)
    streamRef.current?.getTracks().forEach((t) => {
      try { t.stop() } catch {}
    })
    streamRef.current = null
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 480 }, height: { ideal: 480 } },
        audio: true,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => {
            try { t.stop() } catch {}
          })
          return
        }
        streamRef.current = s
        if (liveRef.current) {
          liveRef.current.srcObject = s
          liveRef.current.play().catch(() => {})
        }
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('Camera unavailable — allow access and retry.')
      })
    return () => {
      cancelled = true
    }
  }, [facing])

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (reviewUrl) URL.revokeObjectURL(reviewUrl)
      try {
        if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
      } catch {}
      streamRef.current?.getTracks().forEach((t) => {
        try { t.stop() } catch {}
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const stopRecord = () => {
    const rec = recorderRef.current
    recorderRef.current = null
    stopTimer()
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {}
    }
    setRecording(false)
  }

  const startRecord = () => {
    const stream = streamRef.current
    if (!stream || recording || reviewUrl) return
    if (typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser.')
      return
    }
    const mime = pickMime()
    chunksRef.current = []
    try {
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const secs = Math.max(1, Math.round((Date.now() - startAtRef.current) / 1000))
        const type = mime || 'video/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        if (blob.size === 0) {
          setError('Empty recording — try again.')
          return
        }
        durationRef.current = secs
        setElapsed(secs)
        setReviewUrl(URL.createObjectURL(blob))
      }
      recorderRef.current = rec
      startAtRef.current = Date.now()
      rec.start(500)
      setElapsed(0)
      setRecording(true)
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startAtRef.current) / 1000)
        setElapsed(s)
        if (s >= MAX_SECONDS) stopRecord()
      }, 250)
    } catch {
      setError('Could not start recording.')
    }
  }

  const handleSend = () => {
    if (!reviewUrl) return
    const secs = Math.max(1, durationRef.current || elapsed)
    fetch(reviewUrl)
      .then((r) => r.blob())
      .then((blob) => onSend(blob, secs))
      .catch(() => setError('Could not read recording.'))
  }

  const handleRetake = () => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl)
    setReviewUrl(null)
    durationRef.current = 0
    setElapsed(0)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col items-center justify-center p-6" role="dialog" aria-label="Record video message">
      <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
        <X className="w-5 h-5" />
      </button>

      {error && !reviewUrl ? (
        <div className="text-center max-w-xs">
          <p className="text-white/80 text-sm">{error}</p>
          <button onClick={onClose} className="mt-4 px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold">
            Close
          </button>
        </div>
      ) : reviewUrl ? (
        <>
          <div className="relative w-64 h-64 rounded-full overflow-hidden bg-slate-800 ring-4 ring-white/10">
            <video
              ref={reviewRef}
              src={reviewUrl}
              autoPlay
              loop
              muted={muted}
              playsInline
              className="w-full h-full object-cover"
              onClick={() => {
                const v = reviewRef.current
                if (!v) return
                if (v.paused) v.play().catch(() => {})
                else v.pause()
              }}
            />
          </div>
          <p className="text-white/70 text-sm mt-3 tabular-nums">{fmt(Math.max(1, durationRef.current || elapsed))}</p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleRetake} className="px-4 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Retake
            </button>
            <button onClick={() => setMuted((m) => !m)} className="px-4 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20">
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={handleSend} className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 flex items-center gap-1.5">
              <Send className="w-4 h-4" /> Send
            </button>
          </div>
          <p className="text-white/40 text-xs mt-3">Tap the circle to play / pause</p>
        </>
      ) : (
        <>
          <div className="relative w-64 h-64 rounded-full overflow-hidden bg-slate-800 ring-4 ring-white/10">
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">Starting camera…</div>}
            <video ref={liveRef} muted playsInline className="w-full h-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
            {recording && (
              <span className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500 text-white tabular-nums">
                ● {fmt(elapsed)} / 1:00
              </span>
            )}
          </div>
          {/* progress ring */}
          <div className="w-64 h-1.5 mt-4 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.min(100, (elapsed / MAX_SECONDS) * 100)}%` }} />
          </div>
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              disabled={recording}
              className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
              aria-label="Switch camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
            <button
              onClick={() => (recording ? stopRecord() : startRecord())}
              disabled={!ready}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
                recording ? 'bg-red-500' : 'bg-white'
              }`}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              {recording ? <Square className="w-6 h-6 text-white" fill="currentColor" /> : <span className="w-6 h-6 rounded-full bg-red-500" />}
            </button>
            <span className="w-11" />
          </div>
          <p className="text-white/40 text-xs mt-3">{recording ? 'Tap square to stop • max 1:00' : 'Tap red to record • max 1:00'}</p>
        </>
      )}
    </div>
  )
}
