/**
 * PE-2B Reminders Manager: real reminder abstraction (localStorage-backed),
 * real panel component. No storage reimplementation inside the tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

import { RemindersPanel } from '../RemindersPanel'
import {
  listReminders,
  cancelReminder,
  scheduleMessageReminder,
  popDueReminders,
} from '../../utils/reminders'

const KEY = 'kb_reminders'
const HOUR = 3600 * 1000

function seed(list: any[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

function rem(id: string, fireAt: number, over: any = {}) {
  return {
    id,
    convId: 9,
    convTitle: 'Hiking Group',
    sender: 'Alice',
    snippet: `snippet ${id}`,
    fireAt,
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

function renderPanel(props: any = {}) {
  act(() => {
    root.render(
      React.createElement(RemindersPanel, {
        onClose: () => {},
        onOpenConversation: () => {},
        ...props,
      }),
    )
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('reminder store primitives', () => {
  it('lists what was scheduled and cancels by id', async () => {
    const r = await scheduleMessageReminder(
      {
        convId: 9,
        convTitle: 'Hiking Group',
        msg: { content: 'bring water', sender_display_name: 'Alice' },
      },
      'hour',
    )
    expect(listReminders().map((x) => x.id)).toContain(r.id)
    expect(cancelReminder(r.id)).toBe(true)
    expect(listReminders().map((x) => x.id)).not.toContain(r.id)
    // localStorage is the persistence: reload-equivalent read stays empty.
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([])
  })

  it('cancel of an unknown id reports false and keeps storage intact', () => {
    seed([rem('a', Date.now() + HOUR)])
    expect(cancelReminder('nope')).toBe(false)
    expect(listReminders()).toHaveLength(1)
  })

  it('corrupted storage reads as empty (ticker rule)', () => {
    localStorage.setItem(KEY, '{broken')
    expect(listReminders()).toEqual([])
    expect(popDueReminders()).toEqual([])
  })
})

describe('RemindersPanel', () => {
  it('renders reminders sorted chronologically with real metadata', () => {
    const t = Date.now()
    seed([rem('late', t + 3 * HOUR), rem('early', t + HOUR), rem('mid', t + 2 * HOUR)])
    renderPanel()
    const text = host.textContent!
    expect(text).toContain('snippet early')
    expect(text).toContain('Alice')
    expect(text).toContain('Hiking Group')
    const order = ['snippet early', 'snippet mid', 'snippet late'].map((s) =>
      text.indexOf(s),
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('shows the empty state with creation guidance', () => {
    seed([])
    renderPanel()
    expect(host.textContent).toContain('No reminders yet')
    expect(host.textContent).toContain('In 1 hour')
  })

  it('delete removes the row immediately and persists the deletion', () => {
    seed([rem('a', Date.now() + HOUR), rem('b', Date.now() + 2 * HOUR)])
    renderPanel()
    expect(host.textContent).toContain('snippet a')
    const btn = host.querySelector('button[aria-label="Cancel reminder from Alice"]')!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).not.toContain('snippet a')
    expect(host.textContent).toContain('snippet b')
    expect(listReminders().map((r) => r.id)).toEqual(['b'])
  })

  it('open action jumps to the source conversation', () => {
    seed([rem('a', Date.now() + HOUR, { convId: 42, convTitle: 'Hiking Group' })])
    const onOpen = vi.fn()
    const onClose = vi.fn()
    renderPanel({ onOpenConversation: onOpen, onClose })
    const btn = host.querySelector('button[aria-label="Open chat Hiking Group"]')!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpen).toHaveBeenCalledWith(42)
  })

  it('reminder without a conversation offers no open action (never faked)', () => {
    seed([rem('a', Date.now() + HOUR, { convId: null, convTitle: 'Chat' })])
    renderPanel()
    expect(host.textContent).toContain('snippet a')
    expect(host.querySelector('button[aria-label^="Open chat"]')).toBeNull()
  })

  it('marks already-due reminders without inventing history', () => {
    seed([rem('due', Date.now() - 1000)])
    renderPanel()
    expect(host.textContent).toContain('Due now')
    expect(host.textContent).toContain('snippet due')
  })

  it('close button dismisses and all controls are named', () => {
    seed([rem('a', Date.now() + HOUR)])
    const onClose = vi.fn()
    renderPanel({ onClose })
    const close = host.querySelector('button[aria-label="Close reminders"]')!
    act(() => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    const unnamed = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b.getAttribute('aria-label') || b.textContent!.trim()),
    )
    expect(unnamed).toEqual([])
  })

  it('never requests notification permission on open', () => {
    const requestPermission = vi.fn()
    ;(window as any).Notification = { permission: 'default', requestPermission }
    seed([rem('a', Date.now() + HOUR)])
    renderPanel()
    expect(host.textContent).toContain('snippet a')
    expect(requestPermission).not.toHaveBeenCalled()
    delete (window as any).Notification
  })
})
