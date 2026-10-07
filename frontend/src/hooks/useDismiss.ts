import { useEffect, useRef } from 'react'
import type React from 'react'

/** Close on Escape. No-op when inactive. Listener always cleaned up. */
export function useEscapeKey(onClose: () => void, active = true) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active])
}

/** Pure swipe-dismiss math (unit-tested): conservative thresholds so small
 *  accidental movements never dismiss. Velocity-aware for deliberate flicks.
 *  Respects nothing about animation — callers handle motion/reduced-motion.
 */
export function shouldDismissSwipe(dy: number, dtMs: number): boolean {
  if (dy <= 0) return false
  if (dy > 120) return true
  if (dy < 40) return false
  const velocity = dy / Math.max(dtMs, 1) // px per ms
  return velocity > 0.5
}

/** Movement tolerance check for long-press (unit-tested). */
export function exceedsTolerance(
  dx: number,
  dy: number,
  tolerancePx = 10,
): boolean {
  return Math.hypot(dx, dy) > tolerancePx
}

type LongPressOpts = {
  /** ms of steady press before firing (default 500). */
  threshold?: number
  /** px of movement that cancels (default 10). */
  tolerance?: number
  /** Called on fire. Must open the SAME actions as the visible control. */
  onLongPress: () => void
}

/**
 * Long-press entry point for existing menus (no new action model).
 * Pointer Events: works for touch/mouse/pen uniformly.
 * - movement beyond tolerance cancels (scroll-safe)
 * - pointerup/pointercancel/leave before threshold cancels (tap-safe)
 * - after firing, the release click is suppressed via onClickCapture check
 *   (see `consumeSuppressedClick`)
 * - text selection, inputs, links, buttons inside are untouched — attach
 *   only to row-level containers, never to interactive children.
 */
export function useLongPress({ threshold = 500, tolerance = 10, onLongPress }: LongPressOpts) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const cb = useRef(onLongPress)
  cb.current = onLongPress

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    start.current = null
  }

  return {
    /** True right after a long-press fired; cleared on next press start. */
    didFire: () => fired.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        // Only primary button / touch contact starts a press.
        if (e.pointerType === 'mouse' && e.button !== 0) return
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          timer.current = null
          start.current = null
          fired.current = true
          cb.current()
        }, threshold)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!start.current) return
        if (
          exceedsTolerance(e.clientX - start.current.x, e.clientY - start.current.y, tolerance)
        ) {
          clear()
        }
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      // Release click after a fired long-press must not also trigger tap.
      onClickCapture: (e: React.SyntheticEvent) => {
        if (fired.current) {
          e.stopPropagation()
          e.preventDefault()
          fired.current = false
        }
      },
      onContextMenu: (e: React.SyntheticEvent) => {
        // Suppress the native callout only when we actually fired.
        if (fired.current) e.preventDefault()
      },
    } as const,
  }
}
