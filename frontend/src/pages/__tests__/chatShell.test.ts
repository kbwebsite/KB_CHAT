/**
 * PE-2J: shell dismissal order — Escape / OS-back close the top-most
 * temporary UI first (paint order), never navigate away from under an open
 * overlay, and cover every panel through the shared close-all path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../services/api', async (importOriginal: any) => {
  const mod: any = await importOriginal()
  const ok = (data: any = {}) =>
    vi.fn(async () => ({ success: true, data }))
  return {
    ...mod,
    isNativeApp: () => false,
    convApi: {
      ...mod.convApi,
      list: vi.fn(async () => ({
        success: true,
        data: [{ id: 9, title: 'Bobby', is_group: false, unread_count: 0, members: [] }],
      })),
      create: ok({}),
      markRead: ok({}),
      archive: ok({}),
      pin: ok({}),
    },
    msgApi: {
      ...mod.msgApi,
      list: vi.fn(),
      search: vi.fn(async () => ({ success: true, data: [] })),
      react: vi.fn(async () => ({})),
      removeReaction: vi.fn(async () => ({})),
      delivered: vi.fn(async () => ({})),
    },
    savedApi: { list: ok([]), save: ok({}), unsave: ok({}) },
    callsApi: { history: ok([]) },
    extendedApi: { ...mod.extendedApi, contacts: ok([]) },
    extrasApi: { get: ok({}) },
    pollApi: { vote: vi.fn() },
    eventApi: { respond: vi.fn() },
    statusApi: { feed: ok({ my_status: [], recent: [], viewed: [] }), my: ok([]) },
  }
})

vi.mock('../../services/websocket', () => ({
  default: {
    markRead: vi.fn(),
    delivered: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn(() => vi.fn()),
    sendTyping: vi.fn(),
  },
}))

import ChatPage from '../../pages/ChatPage'
import { msgApi } from '../../services/api'
import { useChatStore } from '../../store/chat'
import { useAuthStore } from '../../store/auth'

const CID = 9

function imgMsg() {
  return {
    id: 77,
    conversation_id: CID,
    sender_id: 7,
    sender_username: 'bob',
    sender_display_name: 'Bob',
    content: '',
    message_type: 'text',
    created_at: new Date().toISOString(),
    attachments: [
      {
        id: 5,
        mime_type: 'image/jpeg',
        filename: 'pic.jpg',
        original_filename: 'pic.jpg',
        file_path: '/api/uploads/file/pic.jpg',
        cloudinary_url: null,
      },
    ],
    reactions: [],
    status: 'sent',
  }
}

let host: HTMLDivElement
let root: Root

function renderPage() {
  act(() => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/chat'] },
        React.createElement(ChatPage),
      ),
    )
  })
}

function esc() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function selectConversation() {
  const leaf = Array.from(host.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && (el.textContent || '') === 'Bobby',
  ) as HTMLElement
  expect(leaf).not.toBeUndefined()
  // Click bubbles through ConversationItem's row handler (React delegation).
  click(leaf)
  await act(async () => {})
}

function openSearch() {
  const btns = Array.from(host.querySelectorAll('button[aria-label="Global search"]'))
  expect(btns.length).toBeGreaterThan(0)
  click(btns[0])
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
  useAuthStore.setState({ user: { id: 1, username: 'me', display_name: 'Me' } as any, token: 'tok', initialized: true } as any)
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: {},
    hasMore: {},
    loadingMessages: {},
    pendingJump: null,
  } as any)
  ;(msgApi.list as any).mockImplementation(async (cid: number) => ({
    success: true,
    data: { messages: cid === CID ? [imgMsg()] : [], has_more: false },
  }))
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('ChatPage dismissal order', () => {
  it('Escape in a chat closes search first, not the chat', async () => {
    renderPage()
    await act(async () => {})
    await selectConversation()
    openSearch()
    expect(host.querySelector('#global-search-input')).not.toBeNull()
    esc()
    // Search dismissed…
    expect(host.querySelector('#global-search-input')).toBeNull()
    // …but the chat is still open (message list mounted).
    expect(host.querySelector('.message-list')).not.toBeNull()
  })

  it('Escape closes a panel through the shared close-all path', async () => {
    renderPage()
    await act(async () => {})
    click(host.querySelector('button[aria-label="More options"]')!)
    const item = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('role') === 'menuitem' && (b.textContent || '').includes('Reminders'),
    )!
    click(item)
    expect(host.textContent).toContain('No reminders yet')
    esc()
    expect(host.textContent).not.toContain('No reminders yet')
  })

  it('Escape closes the lightbox before the search beneath it', async () => {
    renderPage()
    await act(async () => {})
    await selectConversation()
    const img = host.querySelector('img[alt="pic.jpg"]') as HTMLElement
    expect(img).not.toBeNull()
    click(img)
    expect(host.querySelector('button[aria-label="Close viewer"]')).not.toBeNull()
    openSearch()
    expect(host.querySelector('#global-search-input')).not.toBeNull()
    esc()
    // Top-most (lightbox) goes first; search underneath stays open.
    expect(host.querySelector('button[aria-label="Close viewer"]')).toBeNull()
    expect(host.querySelector('#global-search-input')).not.toBeNull()
    esc()
    expect(host.querySelector('#global-search-input')).toBeNull()
  })
})
