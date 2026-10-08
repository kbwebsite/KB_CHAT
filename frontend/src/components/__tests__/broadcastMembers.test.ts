/**
 * PE-2G broadcast membership UI: real panel against the mocked
 * members/addMember/removeMember contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  broadcastApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    send: vi.fn(),
    members: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  },
}))

import { BroadcastPanel } from '../BroadcastPanel'
import { broadcastApi } from '../../services/api'

const bList = broadcastApi.list as any
const bMembers = broadcastApi.members as any
const bAdd = broadcastApi.addMember as any
const bRemoveMember = broadcastApi.removeMember as any

function blist(id: number, over: any = {}) {
  return { id, name: `Family ${id}`, member_ids: [2], member_count: 1, created_at: new Date().toISOString(), ...over }
}

function member(id: number, username: string) {
  return { id, username, display_name: username, avatar_url: null }
}

let host: HTMLDivElement
let root: Root

function renderPanel() {
  act(() => {
    root.render(React.createElement(BroadcastPanel, { onClose: () => {} }))
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

async function expandMembers() {
  bList.mockResolvedValue({ success: true, data: [blist(1)] })
  bMembers.mockResolvedValue({
    success: true,
    data: { list: blist(1), members: [member(2, 'alice')] },
  })
  renderPanel()
  await act(async () => {})
  act(() => {
    host.querySelector('button[aria-label="Show members of Family 1"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {})
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

describe('BroadcastPanel membership', () => {
  it('expands to show real members', async () => {
    await expandMembers()
    expect(bMembers).toHaveBeenCalledWith(1)
    expect(host.textContent).toContain('@alice')
  })

  it('shows members load error with retry', async () => {
    bList.mockResolvedValue({ success: true, data: [blist(1)] })
    bMembers.mockRejectedValueOnce(new Error('down'))
    renderPanel()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Show members of Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(host.textContent).toContain("Couldn't load members.")
    bMembers.mockResolvedValue({ success: true, data: { list: blist(1), members: [] } })
    act(() => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(bMembers).toHaveBeenCalledTimes(2)
  })

  it('adds a member by username and updates the count', async () => {
    await expandMembers()
    bAdd.mockResolvedValue({ success: true, data: blist(1, { member_ids: [2, 3], member_count: 2 }), message: 'Added to list' })
    bMembers.mockResolvedValue({
      success: true,
      data: { list: blist(1), members: [member(2, 'alice'), member(3, 'bob')] },
    })
    setField(host.querySelector('#broadcast-add-1') as HTMLInputElement, '@bob')
    await act(async () => {
      host.querySelector('button[aria-label="Add member to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bAdd).toHaveBeenCalledWith(1, { username: 'bob' })
    expect(host.textContent).toContain('2 people')
    expect(host.textContent).toContain('@bob')
    expect((host.querySelector('#broadcast-add-1') as HTMLInputElement).value).toBe('')
  })

  it('surfaces add failures without losing the typed name', async () => {
    await expandMembers()
    bAdd.mockRejectedValueOnce({ response: { data: { detail: 'User not found' } } })
    setField(host.querySelector('#broadcast-add-1') as HTMLInputElement, 'ghost')
    await act(async () => {
      host.querySelector('button[aria-label="Add member to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('User not found')
    expect((host.querySelector('#broadcast-add-1') as HTMLInputElement).value).toBe('ghost')
  })

  it('removes a member with confirmation and updates the count', async () => {
    await expandMembers()
    bRemoveMember.mockResolvedValue({ success: true, data: blist(1, { member_ids: [], member_count: 0 }), message: 'Removed from list' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await act(async () => {
      host.querySelector('button[aria-label="Remove @alice from Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bRemoveMember).toHaveBeenCalledWith(1, 2)
    expect(host.textContent).not.toContain('@alice')
    expect(host.textContent).toContain('0 people')
    confirmSpy.mockRestore()
  })

  it('keeps the member when removal fails', async () => {
    await expandMembers()
    bRemoveMember.mockRejectedValueOnce({ response: { data: { detail: 'gone' } } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await act(async () => {
      host.querySelector('button[aria-label="Remove @alice from Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('@alice')
    expect(host.textContent).toContain('gone')
    confirmSpy.mockRestore()
  })
})
