import { useEffect, useRef, useState } from 'react'
import { X, Undo2, Trash2, Check, Paintbrush } from 'lucide-react'

const COLORS = ['#ffffff', '#ff5b5b', '#ffb020', '#22dd88', '#22b8ff', '#7c5cfc', '#ff6bd6', '#111111']
const SIZES = [4, 8, 14]
const BACKGROUNDS = [
  { id: 'dark', css: '#14142a' },
  { id: 'light', css: '#f4f4f8' },
  { id: 'accent', css: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' },
]

type Stroke = { color: string; size: number; points: { x: number; y: number }[] }

/** Hand-drawn doodles: sketch on canvas, send as a PNG image message. */
export function DoodlePad({ onClose, onSend }: { onClose: () => void; onSend: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [bg, setBg] = useState(BACKGROUNDS[0])
  const [, setVersion] = useState(0)
  const colorRef = useRef(color)
  colorRef.current = color
  const sizeRef = useRef(size)
  sizeRef.current = size

  const N = 720

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, N, N)
    for (const s of strokesRef.current) {
      if (s.points.length === 0) continue
      g.strokeStyle = s.color
      g.lineWidth = s.size
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      g.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) g.lineTo(s.points[i].x, s.points[i].y)
      if (s.points.length === 1) g.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1)
      g.stroke()
    }
  }

  useEffect(redraw, [])

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * N,
      y: ((e.clientY - r.top) / r.height) * N,
    }
  }

  const down = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drawingRef.current = { color: colorRef.current, size: sizeRef.current, points: [pos(e)] }
  }
  const move = (e: React.PointerEvent) => {
    const s = drawingRef.current
    if (!s) return
    s.points.push(pos(e))
    redraw()
  }
  const up = () => {
    const s = drawingRef.current
    drawingRef.current = null
    if (s && s.points.length > 0) {
      strokesRef.current.push(s)
      setVersion((c) => c + 1)
    }
  }

  const undo = () => {
    strokesRef.current.pop()
    setVersion((c) => c + 1)
    redraw()
  }
  const clear = () => {
    strokesRef.current = []
    setVersion((c) => c + 1)
    redraw()
  }

  const done = () => {
    const view = document.createElement('canvas')
    view.width = N
    view.height = N
    const g = view.getContext('2d')!
    if (bg.id === 'accent') {
      const grad = g.createLinearGradient(0, 0, N, N)
      grad.addColorStop(0, '#7c5cfc')
      grad.addColorStop(1, '#22d3ee')
      g.fillStyle = grad
    } else {
      g.fillStyle = bg.css
    }
    g.fillRect(0, 0, N, N)
    const src = canvasRef.current!
    g.drawImage(src, 0, 0)
    view.toBlob((blob) => {
      if (!blob) return
      onSend(new File([blob], `doodle_${Date.now()}.png`, { type: 'image/png' }))
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col items-center justify-center p-4" role="dialog" aria-label="Draw a doodle">
      <div className="w-full max-w-md flex items-center justify-between mb-3">
        <p className="text-white font-semibold flex items-center gap-2">
          <Paintbrush className="w-4 h-4" /> Doodle
        </p>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden ring-1 ring-white/15" style={{ background: bg.css }}>
        <canvas
          ref={canvasRef}
          width={N}
          height={N}
          className="w-full h-full touch-none cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>

      <div className="w-full max-w-md mt-3 space-y-2.5">
        <div className="flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${color === c ? 'border-white scale-110' : 'border-white/20'}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBg(b)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${bg.id === b.id ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
            >
              {b.id}
            </button>
          ))}
          <span className="flex-1" />
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${size === s ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
              aria-label={`Brush ${s}px`}
            >
              <span className="rounded-full bg-current" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={strokesRef.current.length === 0} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
          <button onClick={clear} disabled={strokesRef.current.length === 0} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Clear
          </button>
          <button onClick={done} disabled={strokesRef.current.length === 0} className="flex-1 py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" /> Send
          </button>
        </div>
      </div>
    </div>
  )
}
