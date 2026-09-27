/**
 * Regression: optimistic send + WebSocket echo race must never duplicate.
 *
 * Contract under test (frontend/src/store/chat.ts):
 * - every send renders exactly one bubble immediately (unique temp id,
 *   even for same-millisecond taps)
 * - the server echo (HTTP or WS, either order) adopts the temp row in
 *   place via the stable client_id — never appends a second copy
 * - retries reuse the same client_id; refresh merges by server id
 * - no read-receipt HTTP for our own sends
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  convApi: { markRead: vi.fn(async () => ({})), list: vi.fn() },
  msgApi: {
    send: vi.fn(),
    list: vi.fn(),
    edit: vi.fn(),
    delete: vi.fn(),
    react: vi.fn(),
    removeReaction: vi.fn(),
    search: vi.fn(),
    delivered: vi.fn(),
    read: vi.fn(),
    viewOnce: vi.fn(),
  },
}))

vi.mock('../../services/websocket', () => ({
  default: {
    markRead: vi.fn(),
    delivered: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    sendTyping: vi.fn(),
  },
}))

import { useChatStore } from '../chat'
import { useAuthStore } from '../auth'
import { convApi, msgApi } from '../../services/api'

const CID = 9
const ME = 7

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function echo(id: number, content: string, clientId: string | undefined, extra: any = {}) {
  return {
    id,
    conversation_id: CID,
    sender_id: ME,
    sender_username: 'me',
    content,
    message_type: 'text',
    created_at: new Date().toISOString(),
    attachments: [],
    reactions: [],
    status: 'sent',
    client_id: clientId,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { id: ME, username: 'me' } as any, token: 'tok' })
  useChatStore.setState({
    conversations: [{ id: CID, unread_count: 0 } as any],
    currentConversationId: CID,
    messages: {},
    hasMore: {},
    loadingMessages: {},
    typingUsers: {},
    pendingSends: {},
    persistedRead: {},
  })
})

function rows() {
  return useChatStore.getState().messages[CID] || []
}

describe('optimistic send + echo race', () => {
  it('WS echo before HTTP: one bubble, adopted in place', async () => {
    const gate = deferred<any>()
    ;(msgApi.send as any).mockReturnValueOnce(gate.promise)
    const p = useChatStore.getState().sendMessage(CID, 'hello')
    expect(rows()).toHaveLength(1)
    const temp = rows()[0]
    expect(temp.id).toBeLessThan(0)
    const sentBody = (msgApi.send as any).mock.calls[0][1]
    expect(sentBody.client_id).toBeTruthy()

    // echo wins the race
    useChatStore.getState().addMessage(echo(101, 'hello', sentBody.client_id) as any)
    expect(rows()).toHaveLength(1)
    expect(rows()[0].id).toBe(101)

    gate.resolve({ success: true, data: echo(101, 'hello', sentBody.client_id) })
    await p
    expect(rows()).toHaveLength(1)
    expect(rows()[0].id).toBe(101)
  })

  it('HTTP before WS: one bubble, echo merges', async () => {
    const body = { client_id: 'placeholder' }
    ;(msgApi.send as any).mockImplementationOnce(async (_cid: number, b: any) => {
      body.client_id = b.client_id
      return { success: true, data: echo(102, 'hi', b.client_id) }
    })
    await useChatStore.getState().sendMessage(CID, 'hi')
    expect(rows()).toHaveLength(1)
    expect(rows()[0].id).toBe(102)
    // late duplicate echo + duplicate HTTP-shaped echo: still one
    useChatStore.getState().addMessage(echo(102, 'hi', body.client_id) as any)
    useChatStore.getState().addMessage(echo(102, 'hi', body.client_id) as any)
    expect(rows()).toHaveLength(1)
  })

  it('10 rapid sends: unique temps, exact order, no dupes on out-of-order resolve', async () => {
    const gates = Array.from({ length: 10 }, () => deferred<any>())
    const queue = [...gates]
    ;(msgApi.send as any).mockImplementation(() => queue.shift()!.promise)
    const pendings = Array.from({ length: 10 }, (_, i) =>
      useChatStore.getState().sendMessage(CID, String(i + 1)),
    )
    const temps = rows()
    expect(temps).toHaveLength(10)
    expect(new Set(temps.map(m => m.id)).size).toBe(10)
    expect(new Set(temps.map(m => (m as any).client_id)).size).toBe(10)

    // resolve even-indexed first, WS echoes interleaved, odd after
    const bodies = (msgApi.send as any).mock.calls.map((c: any[]) => c[1])
    for (let i = 0; i < 10; i += 2) {
      const id = 200 + i
      useChatStore.getState().addMessage(echo(id, String(i + 1), bodies[i].client_id) as any)
      gates[i].resolve({ success: true, data: echo(id, String(i + 1), bodies[i].client_id) })
    }
    for (let i = 1; i < 10; i += 2) {
      const id = 200 + i
      gates[i].resolve({ success: true, data: echo(id, String(i + 1), bodies[i].client_id) })
      useChatStore.getState().addMessage(echo(id, String(i + 1), bodies[i].client_id) as any)
    }
    await Promise.all(pendings)
    const final = rows()
    expect(final).toHaveLength(10)
    expect(final.map(m => m.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1)),
    )
    expect(final.every(m => m.id > 0)).toBe(true)
  })

  it('retry reuses the same client_id and recovers the bubble', async () => {
    ;(msgApi.send as any).mockRejectedValueOnce(new Error('net down'))
    const p = useChatStore.getState().sendMessage(CID, 'retry me')
    await expect(p).rejects.toThrow()
    const temp = rows()[0]
    expect(temp.status).toBe('failed')
    const firstClient = (msgApi.send as any).mock.calls[0][1].client_id
    expect(firstClient).toBeTruthy()

    ;(msgApi.send as any).mockImplementationOnce(async (_cid: number, b: any) => ({
      success: true,
      data: echo(301, 'retry me', b.client_id),
    }))
    await useChatStore.getState().retryMessage(temp.id)
    expect((msgApi.send as any).mock.calls[1][1].client_id).toBe(firstClient)
    expect(rows()).toHaveLength(1)
    expect(rows()[0].id).toBe(301)
  })

  it('own echo sends no read-receipt HTTP; other sender does', () => {
    useChatStore.getState().addMessage(echo(401, 'mine', undefined) as any)
    expect(convApi.markRead).not.toHaveBeenCalled()
    useChatStore
      .getState()
      .addMessage({ ...echo(402, 'theirs', undefined), sender_id: 8 } as any)
    expect(convApi.markRead).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(2)
  })

  it('history refresh merges by server id without dupes', async () => {
    ;(msgApi.send as any).mockImplementationOnce(async (_cid: number, b: any) => ({
      success: true,
      data: echo(501, 'kept', b.client_id),
    }))
    await useChatStore.getState().sendMessage(CID, 'kept')
    ;(msgApi.list as any).mockResolvedValueOnce({
      success: true,
      data: {
        messages: [echo(501, 'kept', undefined, { status: 'delivered' })],
        has_more: false,
      },
    })
    await useChatStore.getState().fetchMessages(CID)
    expect(rows()).toHaveLength(1)
    expect(rows()[0].id).toBe(501)
  })
})
