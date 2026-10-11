/**
 * Auto-reply panel: header menu entry opens per-chat settings, toggle +
 * text persist to the local store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  usersApi: { search: vi.fn() },
  msgApi: { list: vi.fn(), search: vi.fn(), react: vi.fn(), removeReaction: vi.fn() },
  convApi: { list: vi.fn(), markRead: vi.fn(async () => ({})), setDisappearing: vi.fn(), archive: vi.fn() },
  pollApi: { vote: vi.fn() },
  eventApi: { respond: vi.fn() },
  extrasApi: { get: vi.fn(async () => ({ success: true, data: {} })) },
}))

vi.mock('../../services/websocket', () => ({
  default: { markRead: vi.fn(), delivered: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), on: vi.fn(), sendTyping: vi.fn() },
}))

import { ChatView } from '../ChatView'
import { useChatStore } from '../../store/chat'
import { useAuthStore } from '../../store/auth'

let host: HTMLDivElement
let root: Root

function renderChat() {
  act(() => {
    root.render(
      React.createElement(ChatView, {
        onBack: () => {},
        onMobileViewChange: () => {},
        replyTo: null,
        setReplyTo: () => {},
        editTarget: null,
        setEditTarget: () => {},
        editText: '',
        setEditText: () => {},
        selectedIds: new Set(),
        setSelectedIds: () => {},
        savedIds: new Set(),
        setSavedIds: () => {},
        pinnedMessages: [],
        setPinnedMessages: () => {},
      }),
    )
  })
}

function setField(el: HTMLTextAreaElement, v: string) {
  act(() => {
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  if (!window.HTMLElement.prototype.scrollTo) {
    (window.HTMLElement.prototype as any).scrollTo = vi.fn()
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 1, username: 'me', display_name: 'Me' } as any, token: 'tok' })
  useChatStore.setState({
    conversations: [{ id: 9, title: 'Bob', is_group: false, unread_count: 0, members: [] } as any],
    currentConversationId: 9,
    messages: { 9: [] },
    hasMore: {},
    loadingMessages: {},
    pendingJump: null,
  } as any)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('ChatView auto-reply panel', () => {
  function openPanel() {
    renderChat()
    const menu = host.querySelector('button[aria-label="More options"]')!
    act(() => {
      menu.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const item = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('role') === 'menuitem' && (b.textContent || '').includes('Auto-reply'),
    )!
    expect(item).not.toBeUndefined()
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('opens from the header menu and persists toggle + text', () => {
    openPanel()
    expect(host.textContent).toContain('Auto-reply — this conversation only')
    const box = host.querySelector('#autoreply-text') as HTMLTextAreaElement
    setField(box, 'In a meeting, back soon')
    const toggle = box.closest('div')!.parentElement!.querySelector('input[type="checkbox"]') as HTMLInputElement
    act(() => {
      toggle.click()
    })
    const saved = JSON.parse(localStorage.getItem('kb_autoreply') || '{}')['9']
    expect(saved.on).toBe(true)
    expect(saved.text).toBe('In a meeting, back soon')
  })

  it('shows the stored config when reopened', () => {
    localStorage.setItem('kb_autoreply', JSON.stringify({ 9: { on: true, text: 'Busy', lastSent: 0 } }))
    openPanel()
    expect((host.querySelector('#autoreply-text') as HTMLTextAreaElement).value).toBe('Busy')
  })
})
