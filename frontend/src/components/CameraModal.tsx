import { useEffect, useRef, useState } from 'react'
import { X, Camera, RefreshCw } from 'lucide-react'

/**
 * In-app camera: live preview, front/back switch, capture uploads straight
 * into chat. Tracks are always stopped on close/unmount so the camera
 * light never lingers.
 */
export function CameraModal({
  onClose,
  onCapture,
}: {
  onClose: () => void
  onCapture: (file: File) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let live = true
    setError(null)
    setReady(false)
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera not supported in this browser')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (!live) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
          setReady(true)
        }
      })
      .catch(() => {
        if (live) setError('Camera blocked — allow access and retry')
      })
    return () => {
      live = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing])

  const snap = () => {
    const video = videoRef.current
    if (!video || !ready) return
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    if (!w || !h) return
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    // Mirror the front camera so text/selfies look right.
    if (facing === 'user') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    c.toBlob(
      (blob) => {
        if (!blob) return
        onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-card rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Take a photo</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted" aria-label="Close camera">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative bg-black aspect-[3/4] max-h-[60vh] flex items-center justify-center overflow-hidden">
          {error ? (
            <p className="text-xs text-destructive px-6 text-center">{error}</p>
          ) : (
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          )}
        </div>
        <div className="p-3 flex items-center justify-center gap-4 border-t bg-card">
          <button
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            className="p-3 rounded-full bg-muted hover:bg-accent transition"
            aria-label="Switch camera"
            title="Switch camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={snap}
            disabled={!ready}
            className="w-16 h-16 rounded-full btn-gradient flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
            aria-label="Capture photo"
          >
            <Camera className="w-6 h-6" />
          </button>
          <span className="w-12 text-[11px] text-muted-foreground text-center">
            {facing === 'user' ? 'Front' : 'Back'}
          </span>
        </div>
      </div>
    </div>
  )
}
