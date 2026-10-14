// Advanced admin panels: overview KPIs, user drawer actions, audit list.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../../services/api', () => ({
  aiApi: { status: vi.fn() },
  configApi: { get: vi.fn() },
}))

import { OverviewTab } from '../OverviewTab'
import { UserDrawer } from '../UserDrawer'
import { AuditTab } from '../AuditTab'
import { aiApi, configApi } from '../../../services/api'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
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

const STATS = {
  users: {
    total: 120,
    active: 100,
    deactivated: 5,
    new_7d: 9,
    per_day: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${i + 1}`, count: i })),
  },
  messages: { total: 4000 },
  reports: { open: 3, resolved: 10, appeals_open: 2 },
}

describe('OverviewTab', () => {
  it('renders KPIs, attention actions and health', async () => {
    ;(aiApi.status as any).mockResolvedValue({ data: { live: true } })
    ;(configApi.get as any).mockResolvedValue({ data: { supportEmail: 'owner@example.com' } })
    const onGoto = vi.fn()
    act(() => {
      root.render(React.createElement(OverviewTab, { stats: STATS, loading: false, onGoto }))
    })
    await act(async () => {})
    expect(host.textContent).toContain('120')
    expect(host.textContent).toContain('Needs attention')
    expect(host.textContent).toContain('2 reactivation appeals')
    expect(host.textContent).toContain('AI triage live')
    expect(host.textContent).toContain('owner@example.com')
    const btn = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('appeals'),
    ) as HTMLElement
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onGoto).toHaveBeenCalledWith('reports')
  })
})

describe('UserDrawer', () => {
  const user = { id: 7, username: 'amy', email: 'amy@example.com', display_name: 'Amy', is_active: true, is_admin: false }
  it('fires actions with two-tap confirm on destructive ones', () => {
    const onToggleActive = vi.fn()
    const onDelete = vi.fn()
    const onSetAdmin = vi.fn()
    const onArm = vi.fn()
    let armed: string | null = null
    const render = () => {
      act(() => {
        root.render(
          React.createElement(UserDrawer, {
            user, busy: false, armed,
            onArm: (k: string | null) => { armed = k; onArm(k); render() },
            onClose: () => {}, onToggleActive, onDelete, onSetAdmin,
          }),
        )
      })
    }
    render()
    const btns = Array.from(host.querySelectorAll('button'))
    const del = btns.find((b) => (b.textContent || '').includes('Delete account')) as HTMLElement
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onDelete).not.toHaveBeenCalled()
    expect(onArm).toHaveBeenCalledWith('del7')
    act(() => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onDelete).toHaveBeenCalledWith(7)
    const deact = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Deactivate'),
    ) as HTMLElement
    act(() => {
      deact.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggleActive).toHaveBeenCalledWith(7, false)
  })
})

describe('AuditTab', () => {
  it('lists entries with actor and target', () => {
    const onReload = vi.fn()
    act(() => {
      root.render(
        React.createElement(AuditTab, {
          entries: [
            { id: 3, action_taken: 'user_deactivated', target_type: 'user', target_id: 9, target: { username: 'bo' }, actor_username: 'owner', resolved_at: new Date().toISOString() },
          ],
          loading: false, onReload,
        }),
      )
    })
    expect(host.textContent).toContain('Deactivated user')
    expect(host.textContent).toContain('@bo')
    expect(host.textContent).toContain('@owner')
  })
})
