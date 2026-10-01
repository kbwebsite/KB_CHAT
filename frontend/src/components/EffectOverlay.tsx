import { useEffect, useState } from 'react'
import { onEffect, type EffectKind } from '../utils/messageEffects'

const SETS: Record<EffectKind, string[]> = {
  confetti: ['🎉', '🎊', '✨', '🥳', '🎈', '⭐', '🥂'],
  hearts: ['❤️', '💕', '💖', '💘', '😍', '💗'],
  fireworks: ['🎆', '🎇', '✨', '💥', '🌟', '⚡'],
  slam: ['💥'],
}

interface Particle {
  i: number
  emoji: string
  left: number
  size: number
  duration: number
  delay: number
  drift: number
}

interface Burst {
  id: number
  kind: EffectKind
}

let seq = 0

function makeParticles(kind: EffectKind): Particle[] {
  const set = SETS[kind]
  const n = kind === 'slam' ? 0 : 36
  return Array.from({ length: n }, (_, i) => ({
    i,
    emoji: set[(Math.random() * set.length) | 0],
    left: Math.random() * 100,
    size: 18 + Math.random() * 22,
    duration: 1.6 + Math.random() * 1.6,
    delay: Math.random() * 0.35,
    drift: (Math.random() - 0.5) * 120,
  }))
}

function BurstView({ kind }: { kind: EffectKind }) {
  const [parts] = useState(() => makeParticles(kind))
  if (kind === 'slam') {
    return (
      <div className="kryzen-fx-shake absolute inset-0 flex items-center justify-center">
        <div className="kryzen-fx-slam-pop text-[110px] leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]">
          💥
        </div>
      </div>
    )
  }
  const rise = kind === 'hearts'
  return (
    <div className="absolute inset-0">
      {parts.map((p) => (
        <span
          key={p.i}
          className={rise ? 'kryzen-fx-rise' : 'kryzen-fx-fall'}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: rise ? undefined : '-8%',
            bottom: rise ? '-8%' : undefined,
            fontSize: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ['--fx-drift' as any]: `${p.drift}px`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}

/** Fixed full-screen overlay; renders nothing until an effect fires. */
export function EffectOverlay() {
  const [bursts, setBursts] = useState<Burst[]>([])
  useEffect(
    () =>
      onEffect((kind) => {
        const id = ++seq
        setBursts((b) => [...b.slice(-2), { id, kind }])
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2600)
      }),
    []
  )
  if (bursts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {bursts.map((b) => (
        <BurstView key={b.id} kind={b.kind} />
      ))}
    </div>
  )
}
