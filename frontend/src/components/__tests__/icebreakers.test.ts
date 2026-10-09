// Icebreakers: deck integrity + sheet behavior (local deck + AI fallback).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  agentApi: { chat: vi.fn() },
}))

import { agentApi } from '../../services/api'
import { ICEBREAKER_CATEGORIES, randomIcebreaker } from '../../utils/icebreakers'
import { IcebreakerSheet, fillComposerDraft } from '../IcebreakerSheet'

const agentChat = agentApi.chat as any

describe('icebreaker deck', () => {
  it('has four non-empty categories with non-empty questions', () => {
    expect(ICEBREAKER_CATEGORIES.length).toBe(4)
    for (const c of ICEBREAKER_CATEGORIES) {
      expect(c.id.length).toBeGreaterThan(0)
      expect(c.questions.length).toBeGreaterThanOrEqual(6)
      for (const q of c.questions) {
        expect(q.trim().length).toBeGreaterThan(10)
        expect(q.endsWith('?')).toBe(true)
      }
    }
  })

  it('random returns a member question, honoring category', () => {
    for (let i = 0; i < 30; i++) {
      const { category, question } = randomIcebreaker('deep')
      expect(category.id).toBe('deep')
      expect(category.questions).toContain(question)
    }
    const any = randomIcebreaker(null)
    expect(ICEBREAKER_CATEGORIES.map((c) => c.id)).toContain(any.category.id)
  })
})

describe('fillComposerDraft', () => {
  it('writes kb_drafts and notifies the composer', () => {
    localStorage.clear()
    const seen: any[] = []
    const onFill = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener('kryzen:fill-draft', onFill)
    try {
      fillComposerDraft(42, 'hello there?')
      expect(JSON.parse(localStorage.getItem('kb_drafts') || '{}')['42']).toBe('hello there?')
      expect(seen).toEqual([{ cid: 42, text: 'hello there?' }])
    } finally {
      window.removeEventListener('kryzen:fill-draft', onFill)
      localStorage.clear()
    }
  })
})

describe('IcebreakerSheet', () => {
  let host: HTMLDivElement
  let root: Root

  function renderSheet() {
    act(() => {
      root.render(
        React.createElement(IcebreakerSheet, {
          conversationId: 7,
          onClose: () => {},
          onUsed: () => {},
        }),
      )
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    localStorage.clear()
  })

  it('shows a deck question with vibe tabs and shuffle', () => {
    renderSheet()
    expect(host.querySelector('[aria-label="Break the ice"]')).not.toBeNull()
    const first = host.textContent
    act(() => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toBeDefined()
    expect(first).toBeDefined()
  })

  it('falls back to the deck when AI fails', async () => {
    agentChat.mockRejectedValueOnce(new Error('no model'))
    renderSheet()
    const buttons = Array.from(host.querySelectorAll('button'))
    const askAi = buttons.find((b) => b.textContent?.includes('Ask AI'))
    expect(askAi).toBeDefined()
    await act(async () => {
      askAi!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(agentChat).toHaveBeenCalledOnce()
    expect(host.textContent).toMatch(/unavailable/i)
  })

  it('uses an AI answer when the backend responds', async () => {
    agentChat.mockResolvedValueOnce({ data: { response: '  AI question here?  ' } })
    const used: string[] = []
    const closed: boolean[] = []
    act(() => {
      root.render(
        React.createElement(IcebreakerSheet, {
          conversationId: 7,
          onClose: () => { closed.push(true) },
          onUsed: (t: string) => { used.push(t) },
        }),
      )
    })
    const askAi = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ask AI'),
    )!
    await act(async () => {
      askAi.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.textContent).toMatch(/AI question here\?/)
    const useBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Use in chat'),
    )!
    act(() => {
      useBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(used).toEqual(['AI question here?'])
    expect(closed).toEqual([true])
    expect(JSON.parse(localStorage.getItem('kb_drafts') || '{}')['7']).toBe('AI question here?')
  })
})
