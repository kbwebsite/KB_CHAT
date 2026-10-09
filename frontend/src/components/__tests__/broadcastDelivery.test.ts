/**
 * PE-2I broadcast delivery visibility: real panel against the mocked
 * send + receipts contracts. Statuses asserted are exactly the server's
 * read/delivered/sent buckets — never invented.
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
  msgApi: { receipts: vi.fn() },
}))

import { BroadcastPanel } from '../BroadcastPanel'
import { broadcastApi, msgApi } from '../../services/api'

const bList = broadcastApi.list as any
const bSend = broadcastApi.send as any
const mReceipts = msgApi.receipts as any

function blist(id: number, over: any = {}) {
  return { id, name: `Family ${id}`, member_ids: [2, 3], member_count: 2, created_at: new Date().toISOString(), ...over }
}

function sent(uid: number, cid = 100 + uid, mid = 1000 + uid) {
  return { user_id: uid, conversation_id: cid, message_id: mid }
}

function receiptsFor(uid: number, bucket: 'sent' | 'delivered' | 'read') {
  const entry = { user_id: uid, display_name: `User${uid}`, username: `user${uid}`, avatar_url: null }
  return {
    success: true,
    data: {
      read: bucket === 'read' ? [entry] : [],
      delivered: bucket === 'delivered' ? [entry] : [],
      sent: bucket === 'sent' ? [entry] : [],
    },
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

async function sendOk() {
  bList.mockResolvedValue({ success: true, data: [blist(1)] })
  bSend.mockResolvedValue({
    success: true,
    data: { sent_to: [2, 3], sent: [sent(2), sent(3)] },
    message: 'Sent to 2 chats',
  })
  renderPanel()
  await act(async () => {})
  setField(host.querySelector('#broadcast-draft-1') as HTMLInputElement, 'hello')
  await act(async () => {
    host.querySelector('button[aria-label="Send broadcast to Family 1"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
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

describe('BroadcastPanel delivery visibility', () => {
  it('offers delivery details after send without prefetching receipts', async () => {
    await sendOk()
    expect(host.textContent).toContain('Delivery · Family 1 · 2 sent')
    expect(mReceipts).not.toHaveBeenCalled()
  })

  it('labels each recipient from the real receipts buckets', async () => {
    await sendOk()
    mReceipts.mockImplementation((mid: number) =>
      Promise.resolve(receiptsFor(mid === 1002 ? 2 : 3, mid === 1002 ? 'delivered' : 'read')),
    )
    act(() => {
      host.querySelector('button[aria-label="Show delivery status for the last broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(mReceipts).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('User2')
    expect(host.textContent).toContain('User3')
    expect(host.querySelector('[aria-label="User2: Delivered"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="User3: Read"]')).not.toBeNull()
  })

  it('never invents read/delivered: untouched recipients show Sent', async () => {
    await sendOk()
    mReceipts.mockImplementation((mid: number) =>
      Promise.resolve(receiptsFor(mid - 1000, 'sent')),
    )
    act(() => {
      host.querySelector('button[aria-label="Show delivery status for the last broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(host.textContent).not.toContain('Delivered')
    expect(host.textContent).not.toContain('Read')
    expect(host.querySelectorAll('[aria-label$=": Sent"]').length).toBe(2)
  })

  it('shows receipts errors with retry', async () => {
    await sendOk()
    mReceipts.mockRejectedValueOnce(new Error('down'))
    act(() => {
      host.querySelector('button[aria-label="Show delivery status for the last broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(host.textContent).toContain("Couldn't load statuses.")
    mReceipts.mockImplementation((mid: number) =>
      Promise.resolve(receiptsFor(mid - 1000, 'sent')),
    )
    act(() => {
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(host.querySelectorAll('[aria-label$=": Sent"]').length).toBe(2)
  })

  it('opens the DM chat per recipient', async () => {
    await sendOk()
    mReceipts.mockImplementation((mid: number) =>
      Promise.resolve(receiptsFor(mid - 1000, 'sent')),
    )
    const onOpenChat = vi.fn()
    renderPanel({ onOpenChat })
    await act(async () => {})
    // resend within the fresh mount to populate lastSend
    setField(host.querySelector('#broadcast-draft-1') as HTMLInputElement, 'again')
    await act(async () => {
      host.querySelector('button[aria-label="Send broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      host.querySelector('button[aria-label="Show delivery status for the last broadcast to Family 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Open chat with User2"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenChat).toHaveBeenCalledWith(102)
  })
})
