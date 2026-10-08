/**
 * PE-2D Highlights (PATH B): real panel against the mocked
 * statusApi.highlights contract. Backend behavior is covered by the backend
 * suite; here we pin the UI's use of the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  statusApi: {
    feed: vi.fn(),
    my: vi.fn(),
    highlights: {
      list: vi.fn(),
      create: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { HighlightsPanel } from '../HighlightsPanel'
import { statusApi } from '../../services/api'
import { useAuthStore } from '../../store/auth'

const hl = statusApi.highlights as any
const my = statusApi.my as any

function highlight(id: number, over: any = {}) {
  return {
    id,
    title: `Trip ${id}`,
    cover: null,
    status_count: 1,
    created_at: new Date().toISOString(),
    statuses: [
      {
        id: 1000 + id,
        user_id: 7,
        content: 'beach day',
        media_type: 'text',
        media_url: null,
        background: null,
        privacy: 'contacts',
        created_at: new Date().toISOString(),
      },
    ],
    ...over,
  }
}

let host: HTMLDivElement
let root: Root

function renderPanel(props: any = {}) {
  act(() => {
    root.render(
      React.createElement(HighlightsPanel, {
        onClose: () => {},
        onViewer: () => {},
        ...props,
      }),
    )
  })
}

function setInput(v: string) {
  const input = host.querySelector('input[aria-label="New highlight title"]') as HTMLInputElement
  act(() => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({
    user: { id: 7, username: 'me', display_name: 'Me', avatar_url: null } as any,
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('HighlightsPanel', () => {
  it('shows loading, then real highlight rows', async () => {
    hl.list.mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(host.querySelector('[aria-label="Loading highlights"]')).not.toBeNull()
    act(() => {
      root.unmount()
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    hl.list.mockResolvedValue({ success: true, data: [highlight(1), highlight(2)] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('Trip 1')
    expect(host.textContent).toContain('Trip 2')
  })

  it('shows the empty state with creation guidance', async () => {
    hl.list.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('No highlights yet')
  })

  it('shows error + retry, and retry refires', async () => {
    hl.list.mockRejectedValueOnce(new Error('down'))
    renderPanel()
    await act(async () => {})
    expect(host.textContent).toContain('Could not load highlights')
    hl.list.mockResolvedValue({ success: true, data: [] })
    const btn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    )!
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(hl.list).toHaveBeenCalledTimes(2)
  })

  it('creates a highlight from the title input', async () => {
    hl.list.mockResolvedValue({ success: true, data: [] })
    hl.create.mockResolvedValue({ success: true, data: highlight(9, { title: 'New one' }) })
    renderPanel()
    await act(async () => {})
    setInput('New one')
    const btn = host.querySelector('button[aria-label="Create highlight"]')!
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hl.create).toHaveBeenCalledWith('New one')
    expect(hl.list).toHaveBeenCalledTimes(2)
  })

  it('expands a highlight, views an item in the status viewer, removes an item', async () => {
    hl.list.mockResolvedValue({ success: true, data: [highlight(1)] })
    hl.removeItem.mockResolvedValue({ success: true, data: highlight(1, { statuses: [] }) })
    const onViewer = vi.fn()
    renderPanel({ onViewer })
    await act(async () => {})
    const toggle = host.querySelector('button[aria-label="Expand highlight Trip 1"]')!
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('beach day')
    const view = host.querySelector('button[aria-label="View highlight item 1 in Trip 1"]')!
    act(() => {
      view.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onViewer).toHaveBeenCalledTimes(1)
    const passed = onViewer.mock.calls[0][0] as any[]
    expect(passed).toHaveLength(1)
    expect(passed[0].display_name).toBe('Me')
    const remove = host.querySelector('button[aria-label="Remove item from highlight Trip 1"]')!
    await act(async () => {
      remove.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hl.removeItem).toHaveBeenCalledWith(1, 1001)
  })

  it('deletes a highlight with confirmation', async () => {
    hl.list.mockResolvedValue({ success: true, data: [highlight(1)] })
    hl.delete.mockResolvedValue({ success: true, data: null })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await act(async () => {})
    const del = host.querySelector('button[aria-label="Delete highlight Trip 1"]')!
    await act(async () => {
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hl.delete).toHaveBeenCalledWith(1)
    confirmSpy.mockRestore()
  })

  it('adds an own status to a highlight', async () => {
    hl.list.mockResolvedValue({ success: true, data: [highlight(1)] })
    my.mockResolvedValue({
      success: true,
      data: [{ id: 55, content: 'my new status', media_type: 'text' }],
    })
    hl.addItem.mockResolvedValue({ success: true, data: highlight(1) })
    renderPanel()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Expand highlight Trip 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      host.querySelector('button[aria-label="Add a status to highlight Trip 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(host.textContent).toContain('my new status')
    const pick = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('my new status'),
    )!
    await act(async () => {
      pick.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(hl.addItem).toHaveBeenCalledWith(1, 55)
  })

  it('close button dismisses and all controls are named', async () => {
    hl.list.mockResolvedValue({ success: true, data: [highlight(1)] })
    const onClose = vi.fn()
    renderPanel({ onClose })
    await act(async () => {})
    const close = host.querySelector('button[aria-label="Close highlights"]')!
    act(() => {
      close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    const unnamed = Array.from(host.querySelectorAll('button')).filter(
      (b) => !(b.getAttribute('aria-label') || b.textContent!.trim()),
    )
    expect(unnamed).toEqual([])
  })
})
