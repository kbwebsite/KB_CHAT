/**
 * PE-2J: in-conversation search jump must reach old messages outside the
 * loaded window by reusing the guarded store jump (page ending at target),
 * not a plain latest-page fetch that silently misses its scroll target.
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
import { msgApi } from '../../services/api'
import { useChatStore } from '../../store/chat'
import { useAuthStore } from '../../store/auth'

const OLD_ID = 50
const NEW_ID = 500

function msg(id: number) {
  return {
    id,
    conversation_id: 9,
    sender_id: 7,
    sender_username: 'bob',
    sender_display_name: 'Bob',
    content: `body ${id}`,
    message_type: 'text',
    created_at: new Date().toISOString(),
    attachments: [],
    reactions: [],
    status: 'sent',
  }
}

let host: HTMLDivElement
let root: Root
const onMobileViewChange = vi.fn()

function renderChat() {
  act(() => {
    root.render(
      React.createElement(ChatView, {
        onBack: () => {},
        onMobileViewChange,
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
        showMessageSearch: true,
        messageSearch: 'old',
        setMessageSearch: () => {},
        onCloseSearch: () => {},
      }),
    )
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
    conversations: [{ id: 9, title: 'Bob', is_group: false, unread_count: 0 } as any],
    currentConversationId: 9,
    messages: { 9: [msg(NEW_ID)] },
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

describe('ChatView in-conversation jump', () => {
  it('jumps to an old message via the guarded store path', async () => {
    ;(msgApi.search as any).mockResolvedValue({ success: true, data: [msg(OLD_ID)] })
    ;(msgApi.list as any).mockImplementation(async (cid: number, params: any) => ({
      success: true,
      data: { messages: params?.before ? [msg(OLD_ID), msg(NEW_ID)] : [msg(NEW_ID)], has_more: false },
    }))
    renderChat()
    const input = host.querySelector('input[placeholder="Search in this conversation..."]') as HTMLInputElement
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const row = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes(`body ${OLD_ID}`),
    )!
    expect(row).not.toBeUndefined()
    await act(async () => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // Page ending at the target was fetched (before is exclusive), the old
    // message merged into the list and rendered — the exact jump landing is
    // then handled by the store pendingJump effect (which consumes it).
    const calls = (msgApi.list as any).mock.calls
    expect(calls.some((c: any[]) => c[0] === 9 && c[1]?.before === OLD_ID + 1)).toBe(true)
    expect(host.querySelector(`#msg-${OLD_ID}`)).not.toBeNull()
    expect(onMobileViewChange).toHaveBeenCalledWith('chat')
  })
})
