/**
 * PE-2K AI tools: KBAI smart-search mode + audio transcribe entry.
 * Real page against mocked aiApi contracts; in-app nav asserted via
 * a probe route (no reloads).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('../../services/api', () => ({
  aiApi: {
    status: vi.fn(),
    chatStream: vi.fn(),
    generateImage: vi.fn(),
    analyzeFile: vi.fn(),
    transcribe: vi.fn(),
    smartSearch: vi.fn(),
  },
}))

import KBAIPage from '../KBAIPage'
import { aiApi } from '../../services/api'
import { useAuthStore } from '../../store/auth'

let seenSearch = ''
function Probe() {
  const loc = useLocation()
  seenSearch = loc.search
  return React.createElement('div', null, `chat:${loc.search}`)
}

let host: HTMLDivElement
let root: Root

function renderPage() {
  act(() => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/ai'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/ai', element: React.createElement(KBAIPage) }),
          React.createElement(Route, { path: '/chat', element: React.createElement(Probe) }),
        ),
      ),
    )
  })
}

function setInput(v: string) {
  const ta = host.querySelector('textarea') as HTMLTextAreaElement
  act(() => {
    ta.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(ta, v)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function attach(file: File) {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement
  act(() => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  seenSearch = ''
  if (!window.HTMLElement.prototype.scrollTo) {
    (window.HTMLElement.prototype as any).scrollTo = vi.fn()
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 42, username: 'me', display_name: 'Me' } as any })
  ;(aiApi.status as any).mockResolvedValue({ success: true, data: { live: false } })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('KBAI smart search', () => {
  it('search mode queries and renders hits with open-chat navigation', async () => {
    ;(aiApi.smartSearch as any).mockResolvedValue({
      success: true,
      data: {
        summary: 'Found 1 message.',
        results: [{ id: 7, content: 'hello there', sender: 'Bob', conversation: 'Hiking', conversation_id: 9, created_at: null }],
        count: 1,
      },
    })
    renderPage()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Toggle chat search"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    setInput('hello')
    await act(async () => {
      host.querySelector('button[aria-label="Search chats"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.smartSearch).toHaveBeenCalledWith('hello', expect.any(AbortSignal))
    expect(host.textContent).toContain('Found 1 message.')
    expect(host.textContent).toContain('hello there')
    act(() => {
      host.querySelector('button[aria-label="Open chat Hiking with message from Bob"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(seenSearch).toBe('?conv=9')
  })

  it('shows empty and error states honestly', async () => {
    ;(aiApi.smartSearch as any).mockResolvedValue({ success: true, data: { summary: '', results: [], count: 0 } })
    renderPage()
    await act(async () => {})
    act(() => {
      host.querySelector('button[aria-label="Toggle chat search"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    setInput('zzz')
    await act(async () => {
      host.querySelector('button[aria-label="Search chats"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('No matching messages found.')
    expect(host.querySelector('button[aria-label^="Open chat"]')).toBeNull()
    ;(aiApi.smartSearch as any).mockRejectedValueOnce(new Error('down'))
    setInput('boom')
    await act(async () => {
      host.querySelector('button[aria-label="Search chats"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Search failed')
  })
})

describe('KBAI audio transcribe', () => {
  it('routes audio attachments to transcribe, not analysis', async () => {
    ;(aiApi.transcribe as any).mockResolvedValue({ success: true, data: { transcription: 'hello world' } })
    renderPage()
    await act(async () => {})
    attach(new File(['x'], 'note.mp3', { type: 'audio/mpeg' }))
    expect(host.textContent).toContain('note.mp3')
    await act(async () => {
      host.querySelector('button[aria-label="Analyze file"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.transcribe).toHaveBeenCalledTimes(1)
    expect(aiApi.analyzeFile).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Transcribe note.mp3')
    expect(host.textContent).toContain('hello world')
  })

  it('keeps non-audio attachments on analysis', async () => {
    ;(aiApi.analyzeFile as any).mockResolvedValue({ success: true, data: { analysis: 'looks good' } })
    renderPage()
    await act(async () => {})
    attach(new File(['x'], 'doc.txt', { type: 'text/plain' }))
    await act(async () => {
      host.querySelector('button[aria-label="Analyze file"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.analyzeFile).toHaveBeenCalledTimes(1)
    expect(aiApi.transcribe).not.toHaveBeenCalled()
    expect(host.textContent).toContain('looks good')
  })
})
