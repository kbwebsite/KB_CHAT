/**
 * Mobile gestures: pure dismissal math + long-press hook behavior.
 * Hook tests dispatch real DOM PointerEvents (jsdom) — no gesture lib.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import {
  exceedsTolerance,
  shouldDismissSwipe,
  useLongPress,
} from '../useDismiss'

describe('shouldDismissSwipe', () => {
  it('never dismisses upward or tiny movement', () => {
    expect(shouldDismissSwipe(-50, 100)).toBe(false)
    expect(shouldDismissSwipe(0, 100)).toBe(false)
    expect(shouldDismissSwipe(20, 50)).toBe(false)
    expect(shouldDismissSwipe(39, 10)).toBe(false)
  })
  it('dismisses long deliberate drags regardless of speed', () => {
    expect(shouldDismissSwipe(121, 5000)).toBe(true)
    expect(shouldDismissSwipe(200, 100)).toBe(true)
  })
  it('dismisses short flicks only with velocity', () => {
    expect(shouldDismissSwipe(60, 60)).toBe(true) // 1px/ms flick
    expect(shouldDismissSwipe(60, 500)).toBe(false) // slow drift
    expect(shouldDismissSwipe(40, 40)).toBe(true) // boundary + fast
  })
})

describe('exceedsTolerance', () => {
  it('allows small jitter, cancels real movement', () => {
    expect(exceedsTolerance(5, 5)).toBe(false)
    expect(exceedsTolerance(10, 0)).toBe(false)
    expect(exceedsTolerance(11, 0)).toBe(true)
    expect(exceedsTolerance(0, -30)).toBe(true)
  })
})

describe('useLongPress', () => {
  let host: HTMLDivElement
  let root: Root

  function Probe({ onFire, onParentClick }: { onFire: () => void; onParentClick: () => void }) {
    const { handlers } = useLongPress({ onLongPress: onFire })
    return React.createElement(
      'div',
      { onClick: onParentClick },
      React.createElement('div', { id: 'pressable', ...handlers }),
    )
  }

  function fire(el: Element, type: string, x = 10, y = 10) {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as any
    ev.clientX = x
    ev.clientY = y
    ev.button = 0
    ev.pointerType = 'touch'
    el.dispatchEvent(ev)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.useRealTimers()
  })

  function renderProbe(onFire: () => void, onParentClick: () => void) {
    act(() => {
      root.render(React.createElement(Probe, { onFire, onParentClick }))
    })
    return host.querySelector('#pressable')!
  }

  it('fires after a steady press', () => {
    const onFire = vi.fn()
    const el = renderProbe(onFire, () => {})
    fire(el, 'pointerdown')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('normal tap does not fire', () => {
    const onFire = vi.fn()
    const el = renderProbe(onFire, () => {})
    fire(el, 'pointerdown')
    fire(el, 'pointerup')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('movement cancels the press', () => {
    const onFire = vi.fn()
    const el = renderProbe(onFire, () => {})
    fire(el, 'pointerdown', 10, 10)
    fire(el, 'pointermove', 40, 10)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('release click after firing does not reach the parent (tap suppressed)', () => {
    const onFire = vi.fn()
    const onParentClick = vi.fn()
    const el = renderProbe(onFire, onParentClick)
    fire(el, 'pointerdown')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onFire).toHaveBeenCalledTimes(1)
    fire(el, 'click')
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('ordinary clicks still reach the parent', () => {
    const onParentClick = vi.fn()
    const el = renderProbe(() => {}, onParentClick)
    fire(el, 'pointerdown')
    fire(el, 'pointerup')
    fire(el, 'click')
    expect(onParentClick).toHaveBeenCalledTimes(1)
  })
})
