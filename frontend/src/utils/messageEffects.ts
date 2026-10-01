/** Full-screen message effects (confetti, hearts, fireworks, slam).
 * Local-only delight: firing plays the effect on this device, no protocol
 * or backend change needed. Incoming messages auto-trigger via keywords.
 */

export type EffectKind = 'confetti' | 'hearts' | 'fireworks' | 'slam'

type Listener = (kind: EffectKind) => void

const listeners = new Set<Listener>()

export function onEffect(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function fireEffect(kind: EffectKind): void {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    listeners.forEach((fn) => {
      try {
        fn(kind)
      } catch {}
    })
  } catch {}
}

const KEYWORDS: { kind: EffectKind; test: RegExp }[] = [
  { kind: 'confetti', test: /congrat|celebrat|happy birthday|party\b|cheers|well done|promotion|graduat/i },
  { kind: 'hearts', test: /i love you|love you|❤|💕|xoxo|miss you|anniversary|valentine/i },
  { kind: 'fireworks', test: /\bwow\b|amazing|awesome|incredible|mind ?blown|🎆|🎇|new year/i },
  { kind: 'slam', test: /\burgent\b|breaking|asap|emergency|important!/i },
]

/** Returns the effect a message text should trigger, if any. */
export function effectForText(text: string | null | undefined): EffectKind | null {
  if (!text) return null
  const hit = KEYWORDS.find((k) => k.test.test(text))
  return hit ? hit.kind : null
}

export const EFFECT_OPTIONS: { kind: EffectKind; emoji: string; label: string }[] = [
  { kind: 'confetti', emoji: '🎉', label: 'Confetti' },
  { kind: 'hearts', emoji: '💕', label: 'Hearts' },
  { kind: 'fireworks', emoji: '🎆', label: 'Fireworks' },
  { kind: 'slam', emoji: '💥', label: 'Slam' },
]
