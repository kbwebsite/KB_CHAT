// AI poll maker: suggestion parsing (strict, never fake data) + suggest flow.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  pollApi: { list: vi.fn(), create: vi.fn(), vote: vi.fn(), delete: vi.fn(), close: vi.fn() },
  aiApi: { chat: vi.fn() },
  uploadApi: { upload: vi.fn() },
}))

import { PollPanel, parsePollSuggestion, splitOptionMedia } from '../PollPanel'
import { WYR_DECK, randomDilemma, dilemmaToPoll } from '../../utils/wouldYouRather'
import { pollApi, aiApi, uploadApi } from '../../services/api'
import { useAuthStore } from '../../store/auth'

describe('parsePollSuggestion', () => {
  it('accepts clean JSON with question and options', () => {
    expect(parsePollSuggestion('{"question": "Lunch?", "options": ["Pizza", "Sushi", "Biryani"]}'))
      .toEqual({ question: 'Lunch?', options: ['Pizza', 'Sushi', 'Biryani'] })
  })

  it('extracts JSON surrounded by free text', () => {
    const out = parsePollSuggestion('Sure! {"question": "Q?", "options": ["A", "B"]} Enjoy!')
    expect(out).toEqual({ question: 'Q?', options: ['A', 'B'] })
  })

  it('allows missing question but requires 2+ real options', () => {
    expect(parsePollSuggestion('{"options": ["A", "B"]}')).toEqual({ options: ['A', 'B'] })
    expect(parsePollSuggestion('{"question": "Q?", "options": ["only"]}')).toBeNull()
    expect(parsePollSuggestion('{"question": "Q?", "options": ["  ", ""]}')).toBeNull()
    expect(parsePollSuggestion('{"question": "Q?"}')).toBeNull()
  })

  it('rejects garbage deterministically', () => {
    expect(parsePollSuggestion('')).toBeNull()
    expect(parsePollSuggestion(null)).toBeNull()
    expect(parsePollSuggestion('no braces here')).toBeNull()
    expect(parsePollSuggestion('{not json')).toBeNull()
    expect(parsePollSuggestion('[1,2]')).toBeNull()
    expect(parsePollSuggestion('{"options": "nope"}')).toBeNull()
  })

  it('caps options at 10 and trims question', () => {
    const many = Array.from({ length: 15 }, (_, i) => `O${i}`)
    const out = parsePollSuggestion(JSON.stringify({ question: 'x'.repeat(500), options: many }))!
    expect(out.options.length).toBe(10)
    expect(out.question!.length).toBeLessThanOrEqual(200)
  })
})

let host: HTMLDivElement
let root: Root

function setField(el: HTMLInputElement, v: string) {
  act(() => {
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAuthStore.setState({ user: { id: 1, username: 'me', display_name: 'Me' } as any })
  ;(pollApi.list as any).mockResolvedValue({ success: true, data: [] })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

function renderPanel() {
  act(() => {
    root.render(React.createElement(PollPanel, { conversationId: 9, onClose: () => {} }))
  })
}

async function openCreate() {
  renderPanel()
  await act(async () => {})
  const plus = host.querySelectorAll('button')[0]
  act(() => {
    plus.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('PollPanel AI suggest flow', () => {
  it('fills question and options from a valid suggestion', async () => {
    ;(aiApi.chat as any).mockResolvedValue({
      success: true,
      data: { reply: 'Here you go {"question": "Friday dinner?", "options": ["Pizza", "Sushi"]}' },
    })
    await openCreate()
    const inputs = host.querySelectorAll('input')
    setField(inputs[0] as HTMLInputElement, 'dinner ideas')
    await act(async () => {
      host.querySelector('button[aria-label="Suggest poll options with AI"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.chat).toHaveBeenCalledTimes(1)
    expect((host.querySelectorAll('input')[0] as HTMLInputElement).value).toBe('Friday dinner?')
    const values = Array.from(host.querySelectorAll('input')).map(i => (i as HTMLInputElement).value)
    expect(values).toContain('Pizza')
    expect(values).toContain('Sushi')
  })

  it('shows an honest error when the reply is unusable', async () => {
    ;(aiApi.chat as any).mockResolvedValue({ success: true, data: { reply: 'Hmm, not sure — ask me differently!' } })
    await openCreate()
    setField(host.querySelectorAll('input')[0] as HTMLInputElement, 'blah')
    await act(async () => {
      host.querySelector('button[aria-label="Suggest poll options with AI"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('could not suggest')
  })

  it('shows an honest error on network failure and keeps the topic', async () => {
    ;(aiApi.chat as any).mockRejectedValueOnce(new Error('down'))
    await openCreate()
    setField(host.querySelectorAll('input')[0] as HTMLInputElement, 'outing')
    await act(async () => {
      host.querySelector('button[aria-label="Suggest poll options with AI"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Suggestion failed')
    expect((host.querySelectorAll('input')[0] as HTMLInputElement).value).toBe('outing')
  })

  it('suggest button stays disabled without a topic and guards double taps', async () => {
    ;(aiApi.chat as any).mockImplementation(() => new Promise(() => {}))
    await openCreate()
    const btn = host.querySelector('button[aria-label="Suggest poll options with AI"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    setField(host.querySelectorAll('input')[0] as HTMLInputElement, 'party')
    expect((host.querySelector('button[aria-label="Suggest poll options with AI"]') as HTMLButtonElement).disabled).toBe(false)
    await act(async () => {
      host.querySelector('button[aria-label="Suggest poll options with AI"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      host.querySelector('button[aria-label="Suggest poll options with AI"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.chat).toHaveBeenCalledTimes(1)
  })
})

describe('Would-You-Rather deck', () => {
  it('has enough unique, well-formed dilemmas', () => {
    expect(WYR_DECK.length).toBeGreaterThanOrEqual(20)
    const seen = new Set<string>()
    for (const d of WYR_DECK) {
      expect(d.a.trim().length).toBeGreaterThan(1)
      expect(d.b.trim().length).toBeGreaterThan(1)
      expect(d.a).not.toBe(d.b)
      const key = `${d.a}|${d.b}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('picks uniformly from seeded randomness', () => {
    expect(randomDilemma(() => 0)).toBe(WYR_DECK[0])
    expect(randomDilemma(() => 0.999)).toBe(WYR_DECK[WYR_DECK.length - 1])
  })

  it('converts to the exact poll-create contract', () => {
    const draft = dilemmaToPoll({ a: 'Tea', b: 'Coffee' })
    expect(draft).toEqual({ question: 'Would you rather…', options: ['Tea', 'Coffee'] })
  })
})

describe('PollPanel surprise flow', () => {
  it('fills an editable draft without calling AI', async () => {
    await openCreate()
    await act(async () => {
      host.querySelector('button[aria-label="Surprise me with a Would You Rather poll"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.chat).not.toHaveBeenCalled()
    expect((host.querySelectorAll('input')[0] as HTMLInputElement).value).toBe('Would you rather…')
    const values = Array.from(host.querySelectorAll('input')).map(i => (i as HTMLInputElement).value)
    expect(values.filter(v => v.trim()).length).toBeGreaterThanOrEqual(3)
  })
})

describe('splitOptionMedia', () => {
  it('separates photo URLs from captions', () => {
    expect(splitOptionMedia('Beach https://cdn.example.com/image/upload/pic.jpg'))
      .toEqual({ img: 'https://cdn.example.com/image/upload/pic.jpg', text: 'Beach' })
    expect(splitOptionMedia('https://cdn.example.com/p.png')).toEqual({ img: 'https://cdn.example.com/p.png', text: '' })
    expect(splitOptionMedia('Just text')).toEqual({ img: null, text: 'Just text' })
    expect(splitOptionMedia('')).toEqual({ img: null, text: '' })
    expect(splitOptionMedia(null)).toEqual({ img: null, text: '' })
    expect(splitOptionMedia('See https://example.com/page for details')).toEqual({ img: null, text: 'See https://example.com/page for details' })
  })
})

describe('PollPanel photo options', () => {
  function attachPhoto(name = 'dish.jpg', type = 'image/jpeg') {
    const fileInput = host.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], name, { type })
    act(() => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  it('uploads a photo into the option and renders it on the card', async () => {
    ;(uploadApi.upload as any).mockResolvedValue({ success: true, data: { cloudinary_url: 'https://cdn.example.com/image/upload/dish.jpg' } })
    ;(pollApi.create as any).mockResolvedValue({
      success: true,
      data: {
        id: 3, question: 'Dinner?', is_multiple_choice: false, closes_at: null,
        correct_option_id: null, total_votes: 0, creator_id: 1, creator_name: 'Me',
        options: [{ id: 30, text: 'Pizza https://cdn.example.com/image/upload/dish.jpg', position: 0, vote_count: 0, voter_ids: [] }],
      },
    })
    await openCreate()
    setField(host.querySelectorAll('input')[0] as HTMLInputElement, 'Dinner?')
    act(() => {
      host.querySelector('button[aria-label="Add photo to option 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    attachPhoto()
    await act(async () => {})
    expect((host.querySelectorAll('input')[1] as HTMLInputElement).value).toContain('https://cdn.example.com/image/upload/dish.jpg')
    setField(host.querySelectorAll('input')[2] as HTMLInputElement, 'No photo here')
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Create Poll')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    const img = host.querySelector('img[src="https://cdn.example.com/image/upload/dish.jpg"]')
    expect(img).not.toBeNull()
    expect(host.textContent).toContain('Pizza')
  })

  it('rejects non-image files and reports upload failure honestly', async () => {
    await openCreate()
    act(() => {
      host.querySelector('button[aria-label="Add photo to option 1"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    attachPhoto('notes.txt', 'text/plain')
    expect(host.textContent).toContain('Only image files')
    expect(uploadApi.upload).not.toHaveBeenCalled()
    ;(uploadApi.upload as any).mockRejectedValueOnce(new Error('down'))
    attachPhoto()
    await act(async () => {})
    expect(host.textContent).toContain('Photo upload failed')
  })
})
