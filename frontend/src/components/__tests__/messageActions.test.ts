// Message action scoping: games get no row actions, media gets a slim
// menu, text keeps the full menu. Helpers + bubble rendering.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  usersApi: { search: vi.fn() },
  msgApi: { list: vi.fn(), viewOnce: vi.fn() },
  convApi: { list: vi.fn() },
}))

vi.mock('../../services/websocket', () => ({
  default: { markRead: vi.fn(), on: vi.fn(() => vi.fn()) },
}))

import { MessageBubble } from '../MessageBubble'
import { isGameCardMsg, isMediaMsg } from '../../utils/messageEffects'
import { useAuthStore } from '../../store/auth'

describe('action-scope helpers', () => {
  it('detects all ten game cards, rejects the rest', () => {
    for (const p of ['TTT', 'RPS', 'C4', 'EMOJI', 'CHESS', 'TOD', 'WC', 'WT']) {
      expect(isGameCardMsg({ content: `🎮${p}:new\nhello`, is_deleted: false })).toBe(true)
    }
    expect(isGameCardMsg({ content: '🎮MYS:new:manor\nhello', is_deleted: false })).toBe(true)
    expect(isGameCardMsg({ content: '🎮TH:new\n{"title":"x"}', is_deleted: false })).toBe(true)
    expect(isGameCardMsg({ content: '🎮TTT:move:1:5', is_deleted: false })).toBe(false)
    expect(isGameCardMsg({ content: 'hello', is_deleted: false })).toBe(false)
    expect(isGameCardMsg({ content: '🎮TTT:new', is_deleted: true })).toBe(false)
    expect(isGameCardMsg(null)).toBe(false)
    expect(isGameCardMsg({})).toBe(false)
  })

  it('detects image/video attachments only', () => {
    const att = (mime_type: string) => ({ mime_type, filename: 'f' })
    expect(isMediaMsg({ attachments: [att('image/jpeg')], is_deleted: false })).toBe(true)
    expect(isMediaMsg({ attachments: [att('video/mp4')], is_deleted: false })).toBe(true)
    expect(isMediaMsg({ attachments: [att('audio/ogg')], is_deleted: false })).toBe(false)
    expect(isMediaMsg({ attachments: [], is_deleted: false })).toBe(false)
    expect(isMediaMsg({ is_deleted: false })).toBe(false)
    expect(isMediaMsg({ attachments: [att('image/png')], is_deleted: true })).toBe(false)
    expect(isMediaMsg(null)).toBe(false)
  })
})

let host: HTMLDivElement
let root: Root

function baseMsg(over: any = {}) {
  return {
    id: 1,
    conversation_id: 9,
    sender_id: 7,
    sender_username: 'bob',
    sender_display_name: 'Bob',
    content: 'hello',
    message_type: 'text',
    created_at: new Date().toISOString(),
    attachments: [],
    reactions: [],
    status: 'sent',
    ...over,
  }
}

function renderBubble(msg: any, props: any = {}) {
  act(() => {
    root.render(
      React.createElement(MessageBubble, {
        msg,
        isOwn: false,
        isGroup: true,
        showAvatar: false,
        onReply: () => {},
        onEdit: () => {},
        onDelete: () => {},
        onReact: () => {},
        onCopy: () => {},
        onForward: () => {},
        onSave: () => {},
        onSelect: () => {},
        onReport: () => {},
        onPin: () => {},
        onAIAction: () => {},
        onMobileMore: () => {},
        gameMsgs: [],
        ...props,
      }),
    )
  })
}

function openMore() {
  const more = host.querySelector('button[title="More"]') as HTMLElement
  expect(more).not.toBeNull()
  act(() => {
    more.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 1, username: 'me', display_name: 'Me' } as any, token: 'tok', initialized: true } as any)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('MessageBubble action scoping', () => {
  it("others' game cards expose no row actions and ignore taps", () => {
    const onMobileMore = vi.fn()
    renderBubble(
      baseMsg({ id: 50, content: '🎮EMOJI:new\nAmy started an emoji movie game' }),
      { onMobileMore },
    )
    expect(host.querySelector('button[title="More"]')).toBeNull()
    expect(host.querySelector('button[title="Reply"]')).toBeNull()
    expect(host.querySelector('button[title="Delete"]')).toBeNull()
    const body = host.querySelector('.msg-text') as HTMLElement
    act(() => {
      body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onMobileMore).not.toHaveBeenCalled()
  })

  it('own game cards expose Delete only and open the sheet', () => {
    vi.useFakeTimers()
    try {
      const onMobileMore = vi.fn()
      const onDelete = vi.fn()
      renderBubble(
        baseMsg({ id: 51, content: '🎮TTT:new\nchallenge' }),
        { isOwn: true, onMobileMore, onDelete },
      )
      expect(host.querySelector('button[title="More"]')).toBeNull()
      expect(host.querySelector('button[title="Reply"]')).toBeNull()
      const del = host.querySelector('button[title="Delete"]') as HTMLElement
      expect(del).not.toBeNull()
      act(() => {
        del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onDelete).toHaveBeenCalledTimes(1)
      const body = host.querySelector('.msg-text') as HTMLElement
      act(() => {
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onMobileMore).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(350)
      })
      expect(onMobileMore).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('own word-chain card shows Share + Delete, and typing never opens the sheet', () => {    const onMobileMore = vi.fn()
    const onDelete = vi.fn()
    renderBubble(
      baseMsg({ id: 52, content: '🎮WC:new\nplay!' }),
      { isOwn: true, onMobileMore, onDelete },
    )
    const btns = Array.from(host.querySelectorAll('button')).map((b) => b.getAttribute('title'))
    expect(btns).toContain('Share this result')
    expect(btns).toContain('Delete')
    const input = host.querySelector('input[placeholder*="word"]') as HTMLElement
    expect(input).not.toBeNull()
    act(() => {
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onMobileMore).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('watch-together cards get no row actions; own cards keep Delete + tap sheet', () => {
    const onMobileMore = vi.fn()
    renderBubble(
      baseMsg({ id: 60, content: '🎮WT:new\nhttps://youtu.be/dQw4w9WgXcQ' }),
      { onMobileMore },
    )
    expect(host.querySelector('button[title="More"]')).toBeNull()
    expect(host.querySelector('button[title="Delete"]')).toBeNull()
    expect(host.textContent).toContain('Watch together')

    const ownDelete = vi.fn()
    const ownSheet = vi.fn()
    renderBubble(
      baseMsg({ id: 61, content: '🎮WT:new\nhttps://youtu.be/dQw4w9WgXcQ' }),
      { isOwn: true, onMobileMore: ownSheet, onDelete: ownDelete },
    )
    const del = host.querySelector('button[title="Delete"]') as HTMLElement
    expect(del).not.toBeNull()
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(ownDelete).toHaveBeenCalledTimes(1)
    expect(ownSheet).not.toHaveBeenCalled()
  })

  it('mystery cards render suspects; own cards keep Delete', () => {
    const onMobileMore = vi.fn()
    renderBubble(
      baseMsg({ id: 70, content: '🎮MYS:new:manor\nAmy started a murder mystery' }),
      { onMobileMore },
    )
    expect(host.querySelector('button[title="More"]')).toBeNull()
    expect(host.querySelector('button[title="Delete"]')).toBeNull()
    expect(host.textContent).toContain('Midnight Manor')
    expect(host.textContent).toContain('Butler Ames')

    renderBubble(
      baseMsg({ id: 71, content: '🎮MYS:new:manor\nMe started a murder mystery' }),
      { isOwn: true, onMobileMore, onDelete: () => {} },
    )
    expect(host.querySelector('button[title="Delete"]')).not.toBeNull()
  })

  it('hunt cards show clues + check-in; own cards keep Delete', () => {
    const onMobileMore = vi.fn()
    const hunt = `🎮TH:new\n${JSON.stringify({ title: 'Campus dash', clues: [{ t: 'Banyan shade', la: 13, lo: 80.2, r: 100 }] })}\nAmy hid a treasure`
    renderBubble(baseMsg({ id: 80, content: hunt }), { onMobileMore })
    expect(host.querySelector('button[title="More"]')).toBeNull()
    expect(host.querySelector('button[title="Delete"]')).toBeNull()
    expect(host.textContent).toContain('Campus dash')
    expect(host.textContent).toContain('Banyan shade')
    expect(host.textContent).toContain('Check in')

    renderBubble(baseMsg({ id: 81, content: hunt }), { isOwn: true, onMobileMore, onDelete: () => {} })
    expect(host.querySelector('button[title="Delete"]')).not.toBeNull()
  })

  it('media messages get a slim menu without text-only actions', () => {
    vi.useFakeTimers()
    try {
      const onMobileMore = vi.fn()
      renderBubble(
        baseMsg({
          attachments: [{ id: 5, mime_type: 'image/jpeg', filename: 'pic.jpg', file_path: '/api/x.jpg' }],
        }),
        { onMobileMore },
      )
      const body = host.querySelector('.msg-text') as HTMLElement
      act(() => {
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onMobileMore).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(350)
      })
      expect(onMobileMore).toHaveBeenCalledTimes(1)
      openMore()
      const labels = Array.from(host.querySelectorAll('button')).map((b) => (b.textContent || '').trim())
      expect(labels).toContain('Forward')
      expect(labels).toContain('Save')
      expect(labels).not.toContain('Copy')
      expect(labels).not.toContain('Summarize')
      expect(labels).not.toContain('Translate')
      expect(labels).not.toContain('In 1 hour')
      expect(labels).not.toContain('Pin')
    } finally {
      vi.useRealTimers()
    }
  })

  it('text messages keep the menu without reply, react or reminders', () => {
    renderBubble(baseMsg({ content: 'hello world' }))
    openMore()
    const labels = Array.from(host.querySelectorAll('button')).map((b) => (b.textContent || '').trim())
    for (const want of ['Copy', 'Forward', 'Save', 'Pin', 'Summarize', 'Translate', 'Report']) {
      expect(labels).toContain(want)
    }
    for (const gone of ['In 1 hour', 'At 9 AM']) {
      expect(labels).not.toContain(gone)
    }
    expect(host.querySelector('button[title="Reply"]')).toBeNull()
    expect(host.querySelector('button[aria-label="React to message"]')).not.toBeNull()
  })

  it('double-tap opens reactions instead of the sheet', () => {
    vi.useFakeTimers()
    try {
      const onMobileMore = vi.fn()
      const onReact = vi.fn()
      renderBubble(baseMsg({ content: 'hello double' }), { onMobileMore, onReact })
      const body = host.querySelector('.msg-text') as HTMLElement
      act(() => {
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(onMobileMore).not.toHaveBeenCalled()
      // Picker floats in a body portal (escapes bubble clipping).
      expect(document.querySelector('[aria-label="Choose a reaction"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('smile button opens the reaction picker', () => {
    const onReact = vi.fn()
    renderBubble(baseMsg({ content: 'hello smile' }), { onReact, onMobileMore: () => {} })
    const btn = host.querySelector('button[aria-label="React to message"]') as HTMLElement
    expect(btn).not.toBeNull()
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.querySelector('[aria-label="Choose a reaction"]')).not.toBeNull()
    const pick = document.querySelector('button[aria-label="React ❤️"]') as HTMLElement
    act(() => {
      pick.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onReact).toHaveBeenCalledWith(1, '❤️')
    expect(document.querySelector('[aria-label="Choose a reaction"]')).toBeNull()
  })

  it('swipe right on a message starts a reply', () => {
    const onReply = vi.fn()
    const onMobileMore = vi.fn()
    renderBubble(baseMsg({ content: 'hello swipe' }), { onReply, onMobileMore })
    const row = host.querySelector('.msg-enter') as HTMLElement
    const ts = new Event('touchstart', { bubbles: true }) as any
    ts.touches = [{ clientX: 40, clientY: 200 }]
    const te = new Event('touchend', { bubbles: true }) as any
    te.changedTouches = [{ clientX: 140, clientY: 205 }]
    act(() => {
      row.dispatchEvent(ts)
      row.dispatchEvent(te)
    })
    expect(onReply).toHaveBeenCalledTimes(1)
    expect(onMobileMore).not.toHaveBeenCalled()
  })

  it('short taps and game cards never swipe-reply', () => {
    const onReply = vi.fn()
    renderBubble(baseMsg({ content: 'hello short' }), { onReply, onMobileMore: () => {} })
    const row = host.querySelector('.msg-enter') as HTMLElement
    const ts = new Event('touchstart', { bubbles: true }) as any
    ts.touches = [{ clientX: 40, clientY: 200 }]
    const te = new Event('touchend', { bubbles: true }) as any
    te.changedTouches = [{ clientX: 70, clientY: 202 }]
    act(() => {
      row.dispatchEvent(ts)
      row.dispatchEvent(te)
    })
    expect(onReply).not.toHaveBeenCalled()

    renderBubble(
      baseMsg({ id: 90, content: '🎮TTT:new\nchallenge' }),
      { onReply, onMobileMore: () => {} },
    )
    const grows = host.querySelectorAll('.msg-enter')
    const grow = grows[grows.length - 1] as HTMLElement
    const gs = new Event('touchstart', { bubbles: true }) as any
    gs.touches = [{ clientX: 40, clientY: 200 }]
    const ge = new Event('touchend', { bubbles: true }) as any
    ge.changedTouches = [{ clientX: 200, clientY: 200 }]
    act(() => {
      grow.dispatchEvent(gs)
      grow.dispatchEvent(ge)
    })
    expect(onReply).not.toHaveBeenCalled()
  })
})
