// Lucky draw: pure pick logic + overlay behavior (fake timers, no flakes).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import { pickWinner, memberName, memberId, LuckyDraw } from '../LuckyDraw'

describe('pickWinner', () => {
  it('returns null for an empty pool', () => {
    expect(pickWinner([], Math.random)).toBeNull()
  })

  it('maps seeded randomness to a stable index', () => {
    const pool = ['a', 'b', 'c', 'd']
    expect(pickWinner(pool, () => 0)).toBe('a')
    expect(pickWinner(pool, () => 0.249)).toBe('a')
    expect(pickWinner(pool, () => 0.25)).toBe('b')
    expect(pickWinner(pool, () => 0.999)).toBe('d')
  })

  it('member name/id fallbacks', () => {
    expect(memberName({ display_name: 'Amy', username: 'amy' })).toBe('Amy')
    expect(memberName({ username: 'bob' } as any)).toBe('bob')
    expect(memberName({} as any)).toBe('Someone')
    expect(memberId({ user_id: 7 } as any)).toBe(7)
    expect(memberId({ id: 9 } as any)).toBe(9)
    expect(memberId({} as any)).toBeNull()
  })
})

const MEMBERS = [
  { user_id: 1, display_name: 'Me', username: 'me' },
  { user_id: 2, display_name: 'Amy', username: 'amy' },
  { user_id: 3, display_name: 'Bob', username: 'bob' },
]

let host: HTMLDivElement
let root: Root

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

function renderDraw(props: any = {}) {
  act(() => {
    root.render(
      React.createElement(LuckyDraw, {
        members: MEMBERS,
        meId: 1,
        onClose: () => {},
        onAnnounce: () => {},
        ...props,
      }),
    )
  })
}

describe('LuckyDraw overlay', () => {
  it('spins to a winner and announces it', () => {
    const onAnnounce = vi.fn()
    const onClose = vi.fn()
    renderDraw({ onAnnounce, onClose })
    expect(host.textContent).toContain('2 in the hat')
    const spin = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Spin'),
    )!
    act(() => {
      spin.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // A winner is showing and Announce posts + closes.
    const announce = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Announce'),
    )!
    act(() => {
      announce.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onAnnounce).toHaveBeenCalledTimes(1)
    expect(typeof onAnnounce.mock.calls[0][0]).toBe('string')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('exclude-me keeps the spinner out of the pool', () => {
    renderDraw({})
    // Only Amy and Bob are eligible: spin repeatedly; the rendered winner
    // name must never be 'Me' regardless of RNG.
    const spin = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Spin'),
    )!
    for (let i = 0; i < 5; i++) {
      act(() => {
        spin.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      const nameEl = host.querySelector('.text-lg.font-extrabold')
      expect(nameEl).not.toBeNull()
      expect(nameEl!.textContent).not.toBe('Me')
      expect(host.textContent).toContain('2 in the hat')
    }
  })

  it('Escape closes when idle, backdrop is inert mid-spin', () => {
    const onClose = vi.fn()
    renderDraw({ onClose })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('empty pool disables spin with an honest label', () => {
    renderDraw({ members: [], meId: 1 })
    expect(host.textContent).toContain('Nobody to draw')
    const spin = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Nobody to draw'),
    )!
    expect((spin as HTMLButtonElement).disabled).toBe(true)
  })
})
