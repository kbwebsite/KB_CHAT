import { useEffect, useRef, useState } from 'react'
import { X, Send } from 'lucide-react'

/**
 * Meme maker: classic top/bottom-caption meme baked onto a photo via canvas,
 * then handed back as a JPEG File for upload + send. Pure client-side.
 */
export function MemeMaker({
  file,
  onClose,
  onSend,
}: {
  file: File
  onClose: () => void
  onSend: (file: File) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setError('Could not read that image')
    el.src = url
    return () => {
      URL.revokeObjectURL(url)
      setImg(null)
    }
  }, [file])

  // Redraw live on every keystroke.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const MAX = 1080
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const size = Math.max(24, Math.round(canvas.width / 10))
    ctx.font = `bold ${size}px Impact, 'Arial Black', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(3, Math.round(size / 10))
    ctx.strokeStyle = 'black'
    ctx.fillStyle = 'white'
    const drawLine = (text: string, y: number) => {
      const t = text.toUpperCase()
      if (!t) return
      ctx.strokeText(t, canvas.width / 2, y)
      ctx.fillText(t, canvas.width / 2, y)
    }
    drawLine(top, Math.round(canvas.height * 0.04))
    if (bottom) {
      ctx.textBaseline = 'bottom'
      drawLine(bottom, Math.round(canvas.height * 0.96))
    }
  }, [img, top, bottom])

  const handleSend = () => {
    const canvas = canvasRef.current
    if (!canvas || !img || sending) return
    setSending(true)
    canvas.toBlob(
      (blob) => {
        setSending(false)
        if (!blob) {
          setError('Could not bake meme')
          return
        }
        onSend(new File([blob], 'meme.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-card rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b flex items-center justify-between shrink-0">
          <span className="text-sm font-medium">😂 Meme maker</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted" aria-label="Close meme maker">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 flex items-center justify-center bg-muted/30 min-h-[200px] overflow-y-auto">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <canvas ref={canvasRef} className="max-h-[46vh] w-auto max-w-full rounded-xl shadow" />
          )}
        </div>
        <div className="p-3 space-y-2 border-t bg-card shrink-0">
          <input
            value={top}
            onChange={(e) => setTop(e.target.value)}
            placeholder="TOP TEXT"
            maxLength={60}
            className="w-full px-3 py-2 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm font-bold tracking-wide"
          />
          <input
            value={bottom}
            onChange={(e) => setBottom(e.target.value)}
            placeholder="bottom text"
            maxLength={60}
            className="w-full px-3 py-2 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm font-bold tracking-wide"
          />
          <button
            onClick={handleSend}
            disabled={!img || sending}
            className="w-full py-2.5 rounded-xl btn-gradient font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
          >
            <Send className="w-4 h-4" /> {sending ? 'Baking…' : 'Send meme'}
          </button>
        </div>
      </div>
    </div>
  )
}
