/**
 * PE-2A Global Search: entry, debounce, categories, navigation, stale guard.
 * API contracts mocked; real store jump action; real router (MemoryRouter).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('../../services/api', () => ({
  usersApi: { search: vi.fn() },
  msgApi: { list: vi.fn(), search: vi.fn() },
  convApi: { list: vi.fn() },
}))

vi.mock('../../services/websocket', () => ({
  default: { markRead: vi.fn(), delivered: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), on: vi.fn(), sendTyping: vi.fn() },
}))

import { GlobalSearch } from '../GlobalSearch'
import { usersApi, msgApi } from '../../services/api'
import { useChatStore } from '../../store/chat'

const usersSearch = usersApi.search as any
const msgSearch = msgApi.search as any
const msgList = msgApi.list as any

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function msg(id: number, cid = 9, content = 'hello world') {
  return { id, conversation_id: cid, sender_id: 7, sender_username: 'bob', sender_display_name: 'Bob', content, created_at: new Date().toISOString(), message_type: 'text' }
}

let host: HTMLDivElement
let root: Root
let currentPath = '/chat'

function PathProbe() {
  const loc = useLocation()
  currentPath = loc.pathname
  return null
}

function renderSearch(props: any = {}) {
  act(() => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/chat'] },
        React.createElement(Routes, null,
          React.createElement(Route, {
            path: '*',
            element: React.createElement(React.Fragment, null,
              React.createElement(PathProbe, null),
              React.createElement(GlobalSearch, {
                open: true, onClose: () => {}, onOpenConversation: () => {}, ...props,
              }),
            ),
          }),
        ),
      ),
    )
  })
}

function setInput(v: string) {
  const input = host.querySelector('#global-search-input') as HTMLInputElement
  act(() => {
    input.focus()
    // React 18 reads value from the native setter path in tests.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  currentPath = '/chat'
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useChatStore.setState({
    messages: {}, hasMore: {}, loadingMessages: {}, conversations: [
      { id: 9, title: 'Bob', is_group: false },
      { id: 10, title: 'Hiking Group', is_group: true },
    ] as any,
    currentConversationId: null, pendingJump: null,
  })
})

afterEach(() => {
  act(() => { root.unmount() })
  host.remove()
  vi.useRealTimers()
})

async function flush(ms = 400) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

describe('GlobalSearch', () => {
  it('renders closed as null and open with input + hint', () => {
    act(() => {
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/chat'] },
          React.createElement(GlobalSearch, { open: false, onClose: () => {}, onOpenConversation: () => {} }),
        ),
      )
    })
    expect(host.innerHTML).toBe('')
    renderSearch()
    expect(host.querySelector('#global-search-input')).not.toBeNull()
    expect(host.textContent).toContain('Search people, messages, and conversations')
  })

  it('does not call APIs on empty query', async () => {
    renderSearch()
    await flush()
    expect(usersSearch).not.toHaveBeenCalled()
    expect(msgSearch).not.toHaveBeenCalled()
  })

  it('debounces typing into a single round of requests', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('a')
    setInput('al')
    setInput('ali')
    expect(usersSearch).not.toHaveBeenCalled()
    await flush()
    expect(usersSearch).toHaveBeenCalledTimes(1)
    expect(msgSearch).toHaveBeenCalledTimes(1)
    expect(usersSearch.mock.calls[0][0]).toBe('ali')
  })

  it('renders all three categories from real contracts', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [{ id: 7, username: 'alice', display_name: 'Alice', avatar_url: null, is_online: true }] })
    msgSearch.mockResolvedValue({ success: true, data: [msg(101, 9, 'hello world')] })
    renderSearch()
    // 'bob' matches the seeded 'Bob' conversation for the Chats section;
    // the People/Messages mocks return canned contract-shaped rows.
    setInput('bob')
    await flush()
    // wait for promise resolution
    await act(async () => {})
    expect(host.textContent).toContain('People')
    expect(host.textContent).toContain('Alice')
    expect(host.textContent).toContain('Messages')
    expect(host.textContent).toContain('hello world')
    expect(host.textContent).toContain('Chats')
  })

  it('filters chats client-side with no extra request', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('hiking')
    await flush()
    await act(async () => {})
    expect(host.textContent).toContain('Hiking Group')
    expect(host.textContent).not.toContain('>Bob<')
  })

  it('shows no-results state', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('zzz-no-such-thing')
    await flush()
    await act(async () => {})
    expect(host.textContent).toContain('No results found')
  })

  it('shows error + retry, and retry refires', async () => {
    usersSearch.mockRejectedValueOnce(new Error('down'))
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('boom')
    await flush()
    await act(async () => {})
    expect(host.textContent).toContain('Something went wrong')
    usersSearch.mockResolvedValue({ success: true, data: [] })
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    await act(async () => {})
    expect(usersSearch).toHaveBeenCalledTimes(2)
  })

  it('clear button resets results', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [{ id: 7, username: 'alice', display_name: 'Alice' }] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('alice')
    await flush()
    await act(async () => {})
    expect(host.textContent).toContain('Alice')
    const btn = host.querySelector('button[aria-label="Clear search"]')!
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(host.textContent).not.toContain('Alice')
    expect(usersSearch).toHaveBeenCalledTimes(1)
  })

  it('user row navigates to the profile route', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [{ id: 7, username: 'alice', display_name: 'Alice' }] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    const onClose = vi.fn()
    renderSearch({ onClose })
    setInput('alice')
    await flush()
    await act(async () => {})
    const row = host.querySelector('button[aria-label="Open profile of Alice"]')!
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(currentPath).toBe('/u/alice')
    expect(onClose).toHaveBeenCalled()
  })

  it('message row jumps via the store and notifies the shell', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [] })
    msgSearch.mockResolvedValue({ success: true, data: [msg(101, 9, 'hello world')] })
    msgList.mockResolvedValue({ success: true, data: { messages: [msg(101, 9, 'hello world')], has_more: false } })
    const onOpen = vi.fn()
    const onClose = vi.fn()
    renderSearch({ onOpenConversation: onOpen, onClose })
    setInput('hello')
    await flush()
    await act(async () => {})
    const row = host.querySelector('button[aria-label^="Open message"]')!
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => {})
    expect(onOpen).toHaveBeenCalledWith(9, 101)
    expect(onClose).toHaveBeenCalled()
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 9, mid: 101, found: true })
  })

  it('conversation row opens the conversation', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    const onOpen = vi.fn()
    renderSearch({ onOpenConversation: onOpen })
    setInput('hiking')
    await flush()
    await act(async () => {})
    const row = host.querySelector('button[aria-label="Open group Hiking Group"]')!
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onOpen).toHaveBeenCalledWith(10)
  })

  it('stale responses never overwrite newer results', async () => {
    const dOld = deferred<any>()
    const dNew = deferred<any>()
    let n = 0
    usersSearch.mockImplementation(() => (++n === 1 ? dOld.promise : dNew.promise))
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('abc')
    await flush(400)
    setInput('abcdef')
    await flush(400)
    dNew.resolve({ success: true, data: [{ id: 1, username: 'abcdef', display_name: 'New' }] })
    await act(async () => {})
    dOld.resolve({ success: true, data: [{ id: 2, username: 'abc', display_name: 'Old' }] })
    await act(async () => {})
    expect(host.textContent).toContain('New')
    expect(host.textContent).not.toContain('>Old<')
  })

  it('shows a loading state while requests are in flight', async () => {
    const dU = deferred<any>()
    const dM = deferred<any>()
    usersSearch.mockReturnValue(dU.promise)
    msgSearch.mockReturnValue(dM.promise)
    renderSearch()
    setInput('alice')
    await flush()
    expect(host.querySelector('[aria-label="Searching"]')).not.toBeNull()
    dU.resolve({ success: true, data: [] })
    dM.resolve({ success: true, data: [] })
    await act(async () => {})
    expect(host.querySelector('[aria-label="Searching"]')).toBeNull()
    expect(host.textContent).toContain('No results found')
  })

  it('back and close buttons dismiss the panel', async () => {
    const onClose = vi.fn()
    renderSearch({ onClose })
    const back = host.querySelector('button[aria-label="Back to chats"]')!
    expect(back).not.toBeNull()
    act(() => { back.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    renderSearch({ onClose })
    const close = host.querySelector('button[aria-label="Close search"]')!
    act(() => { close.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('Escape is owned by the shell (no standalone dismissal)', async () => {
    // PE-2J: ChatPage closeTopMost owns Escape so layered overlays dismiss
    // one at a time; the panel must not self-dismiss underneath a higher
    // overlay. Shell-level Escape coverage lives in chatShell.test.ts.
    const onClose = vi.fn()
    renderSearch({ onClose })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(host.querySelector('#global-search-input')).not.toBeNull()
  })

  it('Enter activates the first result', async () => {
    usersSearch.mockResolvedValue({ success: true, data: [{ id: 7, username: 'alice', display_name: 'Alice' }] })
    msgSearch.mockResolvedValue({ success: true, data: [] })
    renderSearch()
    setInput('alice')
    await flush()
    await act(async () => {})
    const input = host.querySelector('#global-search-input')!
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(currentPath).toBe('/u/alice')
  })
})
