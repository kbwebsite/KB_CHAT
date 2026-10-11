/**
 * Community announcement thread: the detail page reads like a WhatsApp
 * announcement group (chat bubbles, newest last) instead of a bare
 * composer box. Sending refreshes the thread.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  communityApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    addGroup: vi.fn(),
    removeGroup: vi.fn(),
    announce: vi.fn(),
    announcements: vi.fn(),
  },
}))

import { CommunitiesPanel } from '../CommunitiesPanel'
import { communityApi } from '../../services/api'
import { useAuthStore } from '../../store/auth'

const cList = communityApi.list as any
const cThread = communityApi.announcements as any
const cAnnounce = communityApi.announce as any

function community(over: any = {}) {
  return {
    id: 1,
    name: 'Kryzen',
    description: 'for testing',
    owner_id: 7,
    created_at: new Date().toISOString(),
    groups: [{ id: 9, title: 'kb', avatar_url: null, member_count: 3 }],
    ...over,
  }
}

function threadItem(over: any = {}) {
  return {
    id: 5,
    text: 'Hello all',
    sender_id: 7,
    sender_username: 'owner',
    sender_display_name: 'Owner',
    sender_avatar: null,
    groups: ['kb'],
    created_at: new Date().toISOString(),
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

function renderPanel() {
  act(() => {
    root.render(
      React.createElement(CommunitiesPanel, {
        onClose: () => {},
        conversations: [],
        onOpenChat: () => {},
      }),
    )
  })
}

async function openCommunity() {
  cList.mockResolvedValue({ success: true, data: [community()] })
  cThread.mockResolvedValue({ success: true, data: [threadItem()] })
  renderPanel()
  await act(async () => {})
  await act(async () => {})
  const card = host.querySelector('[aria-label="Open Kryzen"]') as HTMLElement
  act(() => {
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {})
  await act(async () => {})
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  if (!window.HTMLElement.prototype.scrollTo) {
    (window.HTMLElement.prototype as any).scrollTo = vi.fn()
  }
  if (!window.requestAnimationFrame) {
    (window.requestAnimationFrame as any) = (cb: any) => { cb(); return 0 }
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 7, username: 'owner', display_name: 'Owner' } as any })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('Community announcement thread', () => {
  it('loads the thread on open and renders chat bubbles', async () => {
    await openCommunity()
    expect(cThread).toHaveBeenCalledWith(1)
    const thread = host.querySelector('[aria-label="Announcement thread"]')
    expect(thread).not.toBeNull()
    expect(thread!.textContent).toContain('Hello all')
    // Own message aligns right, WhatsApp-style.
    expect(thread!.querySelector('.justify-end')).not.toBeNull()
  })

  it('member view is read-only with the admin notice', async () => {
    useAuthStore.setState({ user: { id: 8, username: 'mem', display_name: 'Mem' } as any })
    await openCommunity()
    expect(host.querySelector('[aria-label="Announcement thread"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Send announcement"]')).toBeNull()
    expect(host.textContent).toContain('Only admins can send messages here.')
  })

  it('sending an announcement refreshes the thread', async () => {
    await openCommunity()
    expect(cThread).toHaveBeenCalledTimes(1)
    cAnnounce.mockResolvedValue({ success: true, data: { reached: [9] } })
    cThread.mockResolvedValue({ success: true, data: [threadItem(), threadItem({ id: 6, text: 'Second' })] })
    act(() => {
      Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent!.includes('Announce to'),
      )!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const ta = host.querySelector('textarea[aria-label="Write an announcement"]') as HTMLTextAreaElement
    act(() => {
      ta.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, 'Second')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector('button[aria-label="Send announcement"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(cAnnounce).toHaveBeenCalledWith(1, 'Second')
    expect(cThread).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[aria-label="Announcement thread"]')!.textContent).toContain('Second')
  })
})
