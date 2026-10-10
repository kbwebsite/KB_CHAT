/**
 * PE-2K AI tools: AgentPanel code search + index status/refresh.
 * Real panel against mocked agentApi contracts. The tools endpoint is
 * intentionally NOT surfaced (it returns []) — no test pretends otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  agentApi: {
    chat: vi.fn(),
    chatStream: vi.fn(),
    history: vi.fn(),
    retrieve: vi.fn(),
    index: vi.fn(),
    indexStatus: vi.fn(),
  },
}))

import { AgentPanel } from '../AgentPanel'
import { agentApi } from '../../services/api'
import { useAuthStore } from '../../store/auth'

let host: HTMLDivElement
let root: Root

function renderPanel() {
  act(() => {
    root.render(React.createElement(AgentPanel, { onClose: () => {} }))
  })
}

function setInput(selector: string, v: string) {
  const input = host.querySelector(selector) as HTMLInputElement
  act(() => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function openCode() {
  act(() => {
    host.querySelector('button[aria-label="Toggle code search"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  if (!window.HTMLElement.prototype.scrollTo) {
    (window.HTMLElement.prototype as any).scrollTo = vi.fn()
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 7, username: 'me', display_name: 'Me' } as any })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('AgentPanel code search', () => {
  it('searches and renders real code hits', async () => {
    ;(agentApi.indexStatus as any).mockResolvedValue({ success: true, data: { total_vectors: 120 } })
    ;(agentApi.retrieve as any).mockResolvedValue({
      success: true,
      data: {
        results: [
          { file_path: 'src/chat.ts', chunk_type: 'function', name: 'send', language: 'ts', start_line: 10, end_line: 20, content: 'x', score: 0.91, match_type: 'vector' },
        ],
        count: 1,
      },
    })
    renderPanel()
    await act(async () => {})
    openCode()
    setInput('#agent-code-query', 'send message')
    await act(async () => {
      host.querySelector('button[aria-label="Search codebase"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(agentApi.retrieve).toHaveBeenCalledWith('send message', 5, expect.any(AbortSignal))
    expect(host.textContent).toContain('src/chat.ts')
    expect(host.textContent).toContain('0.91')
    expect(host.textContent).toContain('120 vectors indexed')
  })

  it('shows empty state and survives failure', async () => {
    ;(agentApi.indexStatus as any).mockResolvedValue({ success: true, data: { total_vectors: 0 } })
    ;(agentApi.retrieve as any).mockResolvedValue({ success: true, data: { results: [], count: 0 } })
    renderPanel()
    await act(async () => {})
    openCode()
    setInput('#agent-code-query', 'zzz-no-match')
    await act(async () => {
      host.querySelector('button[aria-label="Search codebase"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('No code matches found.')
    ;(agentApi.retrieve as any).mockRejectedValueOnce(new Error('down'))
    setInput('#agent-code-query', 'boom')
    await act(async () => {
      host.querySelector('button[aria-label="Search codebase"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('No code matches found.')
  })

  it('refreshes the index incrementally and surfaces denial honestly', async () => {
    ;(agentApi.indexStatus as any).mockResolvedValue({ success: true, data: { total_vectors: 5 } })
    ;(agentApi.index as any).mockResolvedValue({ success: true, data: { message: 'Incremental update complete.', total_vectors: 9 } })
    renderPanel()
    await act(async () => {})
    openCode()
    await act(async () => {
      host.querySelector('button[aria-label="Refresh code index"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(agentApi.index).toHaveBeenCalledWith(true)
    expect(host.textContent).toContain('Incremental update complete.')
    expect(host.textContent).toContain('9 vectors indexed')
    ;(agentApi.index as any).mockRejectedValueOnce({ response: { status: 403 } })
    await act(async () => {
      host.querySelector('button[aria-label="Refresh code index"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('admin rights')
  })
})

describe('AgentPanel shared thread', () => {
  it('sends through the shared chatStream helper and persists the thread', async () => {
    ;(agentApi.chatStream as any).mockImplementation(
      async (msg: string, cid: number | null, handlers: any) => {
        handlers.onConversation?.(21, 'mock')
        handlers.onFinal?.('agent says hi')
        return 'agent says hi'
      },
    )
    renderPanel()
    await act(async () => {})
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      ta.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, 'hello agent')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector('button[aria-label="Send message"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(agentApi.chatStream).toHaveBeenCalledWith(
      'hello agent', null, expect.objectContaining({}),
    )
    expect(host.textContent).toContain('agent says hi')
    expect(localStorage.getItem('kb_agent_conv_id')).toBe('21')
  })

  it('falls back to non-streaming chat when the stream fails', async () => {
    ;(agentApi.chatStream as any).mockRejectedValueOnce(new Error('down'))
    ;(agentApi.chat as any).mockResolvedValue({
      success: true, data: { response: 'fallback says hi', conversation_id: 22, provider: 'mock' },
    })
    renderPanel()
    await act(async () => {})
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      ta.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, 'retry me')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector('button[aria-label="Send message"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(agentApi.chat).toHaveBeenCalledWith('retry me', null)
    expect(host.textContent).toContain('fallback says hi')
    expect(localStorage.getItem('kb_agent_conv_id')).toBe('22')
  })
})
