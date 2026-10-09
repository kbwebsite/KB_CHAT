/**
 * PE-2J: rapid successive message jumps must land on the LATEST target, and
 * jumps to unknown/deleted conversations must not strand the UI on an
 * infinite "Loading conversation..." spinner.
 *
 * Contract under test (frontend/src/store/chat.ts :: jumpToMessageId):
 * - only the newest jump publishes pendingJump (stale completions return
 *   false and write nothing)
 * - unknown conversation + failed load/missing target → current resets to
 *   null (welcome/list view), no pendingJump
 * - unknown-but-valid conversation refreshes the list once, then jumps
 * - known conversation + missing target keeps the honest open (found=false)
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
import { convApi, msgApi } from '../../services/api'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function msg(id: number, cid: number) {
  return {
    id,
    conversation_id: cid,
    sender_id: 7,
    sender_username: 'bob',
    content: `body ${id}`,
    message_type: 'text',
    created_at: new Date().toISOString(),
    attachments: [],
    reactions: [],
    status: 'sent',
  }
}

function page(messages: any[]) {
  return { success: true, data: { messages, has_more: false } }
}

function reset(convs: number[]) {
  useChatStore.setState({
    conversations: convs.map((id) => ({ id, unread_count: 0 }) as any),
    currentConversationId: null,
    messages: {},
    hasMore: {},
    loadingMessages: {},
    pendingJump: null,
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  reset([9, 10])
})

describe('jumpToMessageId', () => {
  it('stale same-conversation jump never overwrites the newer one', async () => {
    const dA = deferred<any>()
    const dB = deferred<any>()
    ;(msgApi.list as any).mockImplementation((cid: number, params: any) =>
      params?.before === 103 ? dB.promise : dA.promise,
    )
    const st = useChatStore.getState()
    const pA = st.jumpToMessageId(9, 101) // before=102 → dA (slow)
    const pB = st.jumpToMessageId(9, 102) // before=103 → dB (fast)
    dB.resolve(page([msg(102, 9)]))
    expect(await pB).toBe(true)
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 9, mid: 102, found: true })
    dA.resolve(page([msg(101, 9), msg(102, 9)]))
    expect(await pA).toBe(false)
    // Late A must not have clobbered B's landing.
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 9, mid: 102, found: true })
  })

  it('stale cross-conversation jump never overwrites the newer one', async () => {
    const dA = deferred<any>()
    const dB = deferred<any>()
    ;(msgApi.list as any).mockImplementation((cid: number) =>
      cid === 10 ? dB.promise : dA.promise,
    )
    const st = useChatStore.getState()
    const pA = st.jumpToMessageId(9, 101)
    const pB = st.jumpToMessageId(10, 201)
    dB.resolve(page([msg(201, 10)]))
    expect(await pB).toBe(true)
    dA.resolve(page([msg(101, 9)]))
    expect(await pA).toBe(false)
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 10, mid: 201, found: true })
    expect(useChatStore.getState().currentConversationId).toBe(10)
  })

  it('unknown conversation with failed load resets instead of stranding', async () => {
    reset([9])
    ;(msgApi.list as any).mockRejectedValue({ response: { status: 404 } })
    ;(convApi.list as any).mockResolvedValue({ success: true, data: [{ id: 9, unread_count: 0 }] })
    const ok = await useChatStore.getState().jumpToMessageId(999, 1)
    expect(ok).toBe(false)
    expect(useChatStore.getState().currentConversationId).toBeNull()
    expect(useChatStore.getState().pendingJump).toBeNull()
  })

  it('valid-but-unlisted conversation refreshes once, then jumps', async () => {
    reset([9])
    ;(msgApi.list as any).mockResolvedValue(page([msg(201, 10)]))
    ;(convApi.list as any).mockResolvedValue({
      success: true,
      data: [
        { id: 9, unread_count: 0 },
        { id: 10, unread_count: 0 },
      ],
    })
    const ok = await useChatStore.getState().jumpToMessageId(10, 201)
    expect(ok).toBe(true)
    expect(convApi.list).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().currentConversationId).toBe(10)
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 10, mid: 201, found: true })
  })

  it('known conversation with missing target keeps the open fallback', async () => {
    ;(msgApi.list as any).mockResolvedValue(page([]))
    const ok = await useChatStore.getState().jumpToMessageId(9, 101)
    expect(ok).toBe(false)
    expect(convApi.list).not.toHaveBeenCalled()
    expect(useChatStore.getState().currentConversationId).toBe(9)
    expect(useChatStore.getState().pendingJump).toEqual({ cid: 9, mid: 101, found: false })
  })
})
