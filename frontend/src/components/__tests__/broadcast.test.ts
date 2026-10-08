/**
 * PE-2E Broadcast lists: real panel against the mocked broadcastApi
 * contract (list/create/remove/send). Backend behavior is covered by the
 * backend suite; here we pin the UI's use of the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  broadcastApi: { list: vi.fn(), create: vi.fn(), remove: vi.fn(), send: vi.fn() },
}))

import { BroadcastPanel } from '../BroadcastPanel'
import { broadcastApi } from '../../services/api'

const bList = broadcastApi.list as any
const bCreate = broadcastApi.create as any
const bRemove = broadcastApi.remove as any
const bSend = broadcastApi.send as any

function blist(id: number, over: any = {}) {
  return {
    id,
    name: `Family ${id}`,
    member_ids: [2, 3],
    member_count: 2,
    created_at: new Date().toISOString(),
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

function renderPanel(props: any = {}) {
  act(() => {
    root.render(React.createElement(BroadcastPanel, { onClose: () => {}, ...props }))
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

describe('BroadcastPanel', () => {
  it('shows loading, then real lists with member counts', async () => {
    bList.mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(host.querySelector('[aria-label="Loading broadcast lists"]')).not.toBeNull()
    act(() => {
      root.unmount()
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    bList.mockResolvedValue({ success: true, data: [blist(1), blist(2)] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('Family 1')
    expect(host.textContent).toContain('2 people')
  })

  it('shows the empty state', async () => {
    bList.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('No broadcast lists yet')
    expect(host.textContent).toContain('private 1-1 chat')
  })

  it('shows error + retry, and retry refires', async () => {
    bList.mockRejectedValueOnce(new Error('down'))
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain("Couldn't load broadcast lists")
    bList.mockResolvedValue({ success: true, data: [] })
    const btn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    )!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(bList).toHaveBeenCalledTimes(2)
  })

  it('validates the create form before calling the API', async () => {
    bList.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="New broadcast list"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const btn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Create list',
    )!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bCreate).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Name your list first')
  })

  it('creates a list with parsed usernames and prepends it', async () => {
    bList.mockResolvedValue({ success: true, data: [] })
    bCreate.mockResolvedValue({ success: true, data: blist(9, { name: 'Team' }) })
    renderPanel()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="New broadcast list"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    setField(host.querySelector('#broadcast-name') as HTMLInputElement, 'Team')
    setField(host.querySelector('#broadcast-members') as HTMLInputElement, '@alice, bob')
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Create list')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bCreate).toHaveBeenCalledWith({ name: 'Team', member_usernames: ['alice', 'bob'] })
    expect(host.textContent).toContain('Team')
    expect(host.textContent).toContain('Broadcast list created')
  })

  it('deletes a list with confirmation', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(1)] })
    bRemove.mockResolvedValue({ success: true, data: null })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await act(async () => {})
    await act(async () => {
      host.querySelector('button[aria-label="Delete broadcast list Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bRemove).toHaveBeenCalledWith(1)
    expect(host.textContent).not.toContain('Family 1')
    confirmSpy.mockRestore()
  })

  it('keeps the list when delete fails', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(2)] })
    bRemove.mockRejectedValueOnce({ response: { data: { message: 'gone' } } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await act(async () => {})
    await act(async () => {
      host.querySelector('button[aria-label="Delete broadcast list Family 2"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Family 2')
    confirmSpy.mockRestore()
  })

  it('sends a broadcast, clears the draft, and reports reach', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(1)] })
    bSend.mockResolvedValue({ success: true, data: { sent_to: [2, 3] } })
    renderPanel()
    await act(async () => {})
    const input = host.querySelector('#broadcast-draft-1') as HTMLInputElement
    setField(input, 'hello all')
    await act(async () => {
      host.querySelector('button[aria-label="Send broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bSend).toHaveBeenCalledWith(1, 'hello all')
    expect(host.textContent).toContain('Sent to 2 chats')
    expect((host.querySelector('#broadcast-draft-1') as HTMLInputElement).value).toBe('')
  })

  it('Enter sends the draft', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(1)] })
    bSend.mockResolvedValue({ success: true, data: { sent_to: [2] } })
    renderPanel()
    await act(async () => {})
    const input = host.querySelector('#broadcast-draft-1') as HTMLInputElement
    setField(input, 'ping')
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(bSend).toHaveBeenCalledWith(1, 'ping')
  })

  it('close button dismisses and all controls are named', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(1)] })
    const onClose = vi.fn()
    renderPanel({ onClose })
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Close broadcast lists"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    const unnamed = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b.getAttribute('aria-label') || b.textContent!.trim()),
    )
    expect(unnamed).toEqual([])
  })
})
