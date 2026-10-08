/**
 * PE-2F Channel owner edit: real panel against the mocked channelApi
 * contract (list/posts/update). Backend PATCH behavior is covered by
 * tests/test_channels_service.py; here we pin the UI's use of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  channelApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    posts: vi.fn(),
    post: vi.fn(),
  },
  uploadApi: { upload: vi.fn() },
}))

import { ChannelsPanel } from '../ChannelsPanel'
import { channelApi } from '../../services/api'

const cList = channelApi.list as any
const cPosts = channelApi.posts as any
const cUpdate = channelApi.update as any

function chan(id: number, over: any = {}) {
  return {
    id,
    name: `News ${id}`,
    description: `Desc ${id}`,
    owner_id: 7,
    is_owner: true,
    followed: false,
    follower_count: 10,
    post_count: 3,
    created_at: new Date().toISOString(),
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

function renderPanel() {
  act(() => {
    root.render(React.createElement(ChannelsPanel, { onClose: () => {} }))
  })
}

function setField(el: HTMLInputElement, v: string) {
  act(() => {
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openOwnedChannel() {
  cList.mockResolvedValue({ success: true, data: [chan(1)] })
  cPosts.mockResolvedValue({ success: true, data: [] })
  renderPanel()
  await act(async () => {})
  // Row avatar button opens the channel (owned channels are openable).
  const card = host.querySelector('[aria-label="Open News 1"]') as HTMLElement
  act(() => {
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {})
}

async function openEditDialog() {
  await openOwnedChannel()
  act(() => {
    host.querySelector('button[aria-label="Channel menu"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const edit = Array.from(host.querySelectorAll('button')).find(
    (b) => b.textContent!.trim() === 'Edit channel',
  )
  expect(edit).not.toBeUndefined()
  act(() => {
    edit!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  // jsdom has no Element.scrollTo; the panel scrolls its feed on open.
  if (!window.HTMLElement.prototype.scrollTo) {
    (window.HTMLElement.prototype as any).scrollTo = vi.fn()
  }
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

describe('Channel owner edit', () => {
  it('owner sees Edit channel; non-owner does not', async () => {
    await openEditDialog()
    expect(host.querySelector('[aria-label="Edit channel"]')).not.toBeNull()
    act(() => {
      root.unmount()
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    cList.mockResolvedValue({
      success: true,
      data: [chan(2, { is_owner: false, followed: true, owner_id: 9 })],
    })
    cPosts.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await act(async () => {})
    const card = host.querySelector('[aria-label="Open News 2"]') as HTMLElement
    act(() => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Channel menu"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const items = Array.from(host.querySelectorAll('button')).map((b) => b.textContent)
    expect(items).not.toContain('Edit channel')
  })

  it('form preloads current values and Save calls PATCH', async () => {
    cUpdate.mockResolvedValue({
      success: true,
      data: chan(1, { name: 'World', description: 'New desc' }),
    })
    await openEditDialog()
    expect((host.querySelector('#channel-edit-name') as HTMLInputElement).value).toBe('News 1')
    expect((host.querySelector('#channel-edit-desc') as HTMLInputElement).value).toBe('Desc 1')
    setField(host.querySelector('#channel-edit-name') as HTMLInputElement, 'World')
    setField(host.querySelector('#channel-edit-desc') as HTMLInputElement, 'New desc')
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Save changes')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(cUpdate).toHaveBeenCalledWith(1, { name: 'World', description: 'New desc' })
    // Visible channel updates immediately from the response; dialog closes.
    expect(host.textContent).toContain('World')
    expect(host.querySelector('[aria-label="Edit channel"]')).toBeNull()
  })

  it('duplicate submission is prevented', async () => {
    let resolve!: (v: any) => void
    cUpdate.mockReturnValue(new Promise((res) => { resolve = res }))
    await openEditDialog()
    setField(host.querySelector('#channel-edit-name') as HTMLInputElement, 'Twice')
    const save = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save changes',
    )!
    act(() => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    // Button is disabled while saving: a second click cannot refire.
    expect(save.hasAttribute('disabled')).toBe(true)
    act(() => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(cUpdate).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve({ success: true, data: chan(1, { name: 'Twice' }) })
    })
  })

  it('server failure keeps the dialog open with values preserved', async () => {
    cUpdate.mockRejectedValueOnce({ response: { data: { detail: 'nope' } } })
    await openEditDialog()
    setField(host.querySelector('#channel-edit-name') as HTMLInputElement, 'Kept')
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Save changes')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.querySelector('[aria-label="Edit channel"]')).not.toBeNull()
    expect((host.querySelector('#channel-edit-name') as HTMLInputElement).value).toBe('Kept')
    expect(host.textContent).toContain('nope')
    expect(host.textContent).toContain('News 1')
  })

  it('Cancel leaves the channel unchanged', async () => {
    await openEditDialog()
    setField(host.querySelector('#channel-edit-name') as HTMLInputElement, 'Discarded')
    act(() => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(cUpdate).not.toHaveBeenCalled()
    expect(host.querySelector('[aria-label="Edit channel"]')).toBeNull()
    expect(host.textContent).toContain('News 1')
    expect(host.textContent).not.toContain('Discarded')
  })

  it('all edit controls are named', async () => {
    await openEditDialog()
    const unnamed = Array.from(
      host.querySelector('[aria-label="Edit channel"]')!.querySelectorAll('button'),
    ).filter((b) => !(b.getAttribute('aria-label') || (b as HTMLElement).textContent!.trim()))
    expect(unnamed).toEqual([])
    expect(host.querySelector('#channel-edit-name')).not.toBeNull()
    expect(host.querySelector('#channel-edit-desc')).not.toBeNull()
  })
})
