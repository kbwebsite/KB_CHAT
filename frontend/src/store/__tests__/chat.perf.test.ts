/**
 * Wave 4B P3/P4: message-array bound + fetch cancellation/stale protection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  convApi: { list: vi.fn(), markRead: vi.fn() },
  msgApi: { list: vi.fn(), send: vi.fn(), edit: vi.fn(), delete: vi.fn(), react: vi.fn(), removeReaction: vi.fn(), search: vi.fn(), delivered: vi.fn(), read: vi.fn(), viewOnce: vi.fn() },
}))

vi.mock('../../services/websocket', () => ({
  default: { markRead: vi.fn(), delivered: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), on: vi.fn(), sendTyping: vi.fn() },
}))

import { MAX_MESSAGES_PER_CONV, useChatStore } from '../chat'
import { convApi, msgApi } from '../../services/api'

const listMock = msgApi.list as any
const convListMock = convApi.list as any

function msg(id: number, cid = 9) {
  return { id, conversation_id: cid, content: `m${id}`, sender_id: 7, created_at: new Date().toISOString() }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  useChatStore.setState({ messages: {}, hasMore: {}, loadingMessages: {}, conversations: [], currentConversationId: null })
})

describe('message array bound', () => {
  it('trims history to the newest MAX, preserving order and hasMore', async () => {
    const rows = Array.from({ length: MAX_MESSAGES_PER_CONV + 50 }, (_, i) => msg(i + 1))
    listMock.mockResolvedValue({ success: true, data: { messages: rows, has_more: true } })
    await useChatStore.getState().fetchMessages(9)
    const list = useChatStore.getState().messages[9]
    expect(list.length).toBe(MAX_MESSAGES_PER_CONV)
    expect(list[0].id).toBe(51)
    expect(list[list.length - 1].id).toBe(MAX_MESSAGES_PER_CONV + 50)
    expect(useChatStore.getState().hasMore[9]).toBe(true)
  })

  it('trims live appends without losing newest or duplicating', async () => {
    const rows = Array.from({ length: MAX_MESSAGES_PER_CONV }, (_, i) => msg(i + 1))
    listMock.mockResolvedValue({ success: true, data: { messages: rows, has_more: false } })
    await useChatStore.getState().fetchMessages(9)
    useChatStore.getState().addMessage(msg(MAX_MESSAGES_PER_CONV + 1) as any)
    useChatStore.getState().addMessage(msg(MAX_MESSAGES_PER_CONV + 1) as any)
    const list = useChatStore.getState().messages[9]
    expect(list.length).toBe(MAX_MESSAGES_PER_CONV)
    expect(list[list.length - 1].id).toBe(MAX_MESSAGES_PER_CONV + 1)
    expect(new Set(list.map((m: any) => m.id)).size).toBe(list.length)
  })

  it('switching conversations keeps independent bounds', async () => {
    listMock.mockImplementation(async (cid: number) => ({
      success: true,
      data: { messages: [msg(1, cid)], has_more: false },
    }))
    await useChatStore.getState().fetchMessages(9)
    await useChatStore.getState().fetchMessages(10)
    expect(useChatStore.getState().messages[9].length).toBe(1)
    expect(useChatStore.getState().messages[10].length).toBe(1)
  })
})

describe('fetch cancellation', () => {
  it('aborts the previous fetch for the same conversation', async () => {
    const d1 = deferred<any>()
    const seen: any[] = []
    listMock.mockImplementation((_cid: number, _p: any, signal?: AbortSignal) => {
      seen.push(signal)
      return d1.promise
    })
    const p1 = useChatStore.getState().fetchMessages(9)
    expect(seen[0]).toBeDefined()
    const d2 = deferred<any>()
    listMock.mockImplementation((_cid: number, _p: any, signal?: AbortSignal) => {
      seen.push(signal)
      return d2.promise
    })
    const p2 = useChatStore.getState().fetchMessages(9)
    expect(seen[0].aborted).toBe(true)
    expect(seen[1].aborted).toBe(false)
    d1.reject({ name: 'CanceledError', code: 'ERR_CANCELED' })
    await p1 // cancellation is swallowed, never a user-visible error
    d2.resolve({ success: true, data: { messages: [msg(5)], has_more: false } })
    await p2
    expect(useChatStore.getState().messages[9].map((m: any) => m.id)).toEqual([5])
  })

  it('discards a stale response that arrives after a newer fetch', async () => {
    const dOld = deferred<any>()
    const dNew = deferred<any>()
    let n = 0
    listMock.mockImplementation(() => (++n === 1 ? dOld.promise : dNew.promise))
    const pOld = useChatStore.getState().fetchMessages(9)
    const pNew = useChatStore.getState().fetchMessages(9)
    dNew.resolve({ success: true, data: { messages: [msg(9)], has_more: false } })
    await pNew
    dOld.resolve({ success: true, data: { messages: [msg(1)], has_more: false } })
    await pOld
    expect(useChatStore.getState().messages[9].map((m: any) => m.id)).toEqual([9])
  })

  it('does not treat cancellation as failure (loading flag recovers)', async () => {
    const d = deferred<any>()
    listMock.mockReturnValue(d.promise)
    const p = useChatStore.getState().fetchMessages(9)
    // supersede, then let the old one reject as canceled
    listMock.mockResolvedValue({ success: true, data: { messages: [], has_more: false } })
    const p2 = useChatStore.getState().fetchMessages(9)
    d.reject({ name: 'AbortError' })
    await p
    await p2
    expect(useChatStore.getState().loadingMessages[9]).toBe(false)
  })

  it('conversations fetch passes a signal and recovers', async () => {
    convListMock.mockResolvedValue({ success: true, data: [] })
    await useChatStore.getState().fetchConversations()
    expect(convListMock.mock.calls[0][2]).toBeDefined() // signal arg
    expect(useChatStore.getState().loadingConvs).toBe(false)
  })
})
