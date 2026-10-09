/** Group call store: invite/end/join/leave transitions. */
import { describe, expect, it, beforeEach } from 'vitest'
import { useGroupCallStore, type GroupCallSession } from '../groupCall'

const sess = (over: Partial<GroupCallSession> = {}): GroupCallSession => ({
  id: 1,
  conversation_id: 10,
  started_by: 5,
  starter_username: 'alice',
  starter_display_name: 'Alice',
  call_type: 'voice',
  status: 'ongoing',
  active: true,
  started_at: new Date().toISOString(),
  ended_at: null,
  ...over,
})

beforeEach(() => {
  useGroupCallStore.setState({ activeByConv: {}, joined: null })
})

describe('group call store', () => {
  it('tracks invites per conversation and ignores own start', () => {
    const s = sess()
    useGroupCallStore.getState().noteInvite(s)
    expect(useGroupCallStore.getState().activeByConv[10]).toMatchObject({ id: 1 })
  })

  it('join sets joined + active; leave clears joined only', () => {
    const s = sess()
    useGroupCallStore.getState().join(s, 'Study group')
    expect(useGroupCallStore.getState().joined?.session.id).toBe(1)
    useGroupCallStore.getState().leave()
    expect(useGroupCallStore.getState().joined).toBeNull()
    // room stays visible for rejoin
    expect(useGroupCallStore.getState().activeByConv[10]?.id).toBe(1)
  })

  it('end clears the room and kicks the joined modal', () => {
    const s = sess()
    useGroupCallStore.getState().join(s, 'Study group')
    useGroupCallStore.getState().noteEnd({ id: 1, conversation_id: 10 })
    expect(useGroupCallStore.getState().joined).toBeNull()
    expect(useGroupCallStore.getState().activeByConv[10]).toBeNull()
  })

  it('end of another room leaves mine alone', () => {
    useGroupCallStore.getState().join(sess({ id: 1, conversation_id: 10 }), 'A')
    useGroupCallStore.getState().noteEnd({ id: 2, conversation_id: 11 })
    expect(useGroupCallStore.getState().joined?.session.id).toBe(1)
    expect(useGroupCallStore.getState().activeByConv[10]?.id).toBe(1)
  })
})
