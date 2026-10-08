/**
 * PE-2C Saved Messages: real panel against the mocked savedApi contract
 * (list/save/unsave). Backend behavior itself is covered by tests/test_api.py;
 * here we pin the UI's use of the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  savedApi: { list: vi.fn(), save: vi.fn(), unsave: vi.fn() },
  usersApi: { search: vi.fn() },
  msgApi: { list: vi.fn(), search: vi.fn() },
  convApi: { list: vi.fn() },
}))

vi.mock('../../services/websocket', () => ({
  default: { markRead: vi.fn(), delivered: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), on: vi.fn(), sendTyping: vi.fn() },
}))

import { SavedMessagesPanel } from '../SavedMessagesPanel'
import { savedApi } from '../../services/api'

const savedList = savedApi.list as any
const savedUnsave = savedApi.unsave as any

function row(id: number, mid: number, cid = 9, over: any = {}) {
  return {
    id,
    message_id: mid,
    content: `saved body ${mid}`,
    sender_username: 'bob',
    sender_display_name: 'Bob',
    conversation_id: cid,
    created_at: new Date().toISOString(),
    saved_at: new Date().toISOString(),
    ...over,
  }
}

const CONVS = [{ id: 9, title: 'Hiking Group' }] as any

let host: HTMLDivElement
let root: Root

function renderPanel(props: any = {}) {
  act(() => {
    root.render(
      React.createElement(SavedMessagesPanel, {
        onClose: () => {},
        onJump: () => {},
        conversations: CONVS,
        ...props,
      }),
    )
  })
}

beforeEach(() => {
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

describe('SavedMessagesPanel', () => {
  it('shows a loading state, then real rows with conversation context', async () => {
    savedList.mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(host.querySelector('[aria-label="Loading saved messages"]')).not.toBeNull()
    act(() => {
      root.unmount()
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    savedList.mockResolvedValue({ success: true, data: [row(1, 101)] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('saved body 101')
    expect(host.textContent).toContain('Bob')
    expect(host.textContent).toContain('Hiking Group')
  })

  it('falls back to Chat for unknown conversations without inventing names', async () => {
    savedList.mockResolvedValue({ success: true, data: [row(1, 101, 999)] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('saved body 101')
    expect(host.textContent).toContain('Chat')
    expect(host.textContent).not.toContain('Hiking Group')
  })

  it('shows deleted-message content factually', async () => {
    savedList.mockResolvedValue({
      success: true,
      data: [row(1, 101, 9, { content: 'Message deleted' })],
    })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('Message deleted')
  })

  it('shows the empty state', async () => {
    savedList.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('No saved messages yet')
    expect(host.textContent).toContain('Tap bookmark on any message to save it.')
  })

  it('shows error + retry, and retry refires the list call', async () => {
    savedList.mockRejectedValueOnce(new Error('down'))
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('Could not load saved messages')
    savedList.mockResolvedValue({ success: true, data: [] })
    const btn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    )!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(savedList).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('No saved messages yet')
  })

  it('row tap jumps with BOTH conversation and message ids', async () => {
    savedList.mockResolvedValue({ success: true, data: [row(1, 101)] })
    const onJump = vi.fn()
    renderPanel({ onJump })
    await act(async () => {})
    const btn = host.querySelector('button[aria-label^="Open saved message"]')!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onJump).toHaveBeenCalledWith(9, 101)
  })

  it('unsave removes the row and syncs the parent saved set', async () => {
    savedList.mockResolvedValue({ success: true, data: [row(1, 101), row(2, 102)] })
    savedUnsave.mockResolvedValue({ success: true, data: null })
    const onUnsave = vi.fn()
    renderPanel({ onUnsave })
    await act(async () => {})
    const btn = host.querySelector('button[aria-label="Remove saved message from Bob"]')!
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(savedUnsave).toHaveBeenCalledWith(101)
    expect(onUnsave).toHaveBeenCalledWith(101)
    expect(host.textContent).not.toContain('saved body 101')
    expect(host.textContent).toContain('saved body 102')
  })

  it('failed unsave keeps the row', async () => {
    savedList.mockResolvedValue({ success: true, data: [row(1, 101)] })
    savedUnsave.mockRejectedValueOnce(new Error('down'))
    const onUnsave = vi.fn()
    renderPanel({ onUnsave })
    await act(async () => {})
    const btn = host.querySelector('button[aria-label="Remove saved message from Bob"]')!
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onUnsave).not.toHaveBeenCalled()
    expect(host.textContent).toContain('saved body 101')
  })

  it('close button dismisses and all controls are named', async () => {
    savedList.mockResolvedValue({ success: true, data: [row(1, 101)] })
    const onClose = vi.fn()
    renderPanel({ onClose })
    await act(async () => {})
    const close = host.querySelector('button[aria-label="Close saved messages"]')!
    act(() => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    const unnamed = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b.getAttribute('aria-label') || b.textContent!.trim()),
    )
    expect(unnamed).toEqual([])
  })
})
