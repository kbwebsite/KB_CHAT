// AI sticker maker: generate → save into own packs (mocked contracts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  stickerApi: {
    packs: vi.fn(), recent: vi.fn(), use: vi.fn(), toggleFavorite: vi.fn(),
    createPack: vi.fn(), addSticker: vi.fn(), deletePack: vi.fn(),
  },
  aiApi: { generateImage: vi.fn() },
}))

import StickerPicker from '../StickerPicker'
import { stickerApi, aiApi } from '../../services/api'

const packsMock = stickerApi.packs as any
const recentMock = stickerApi.recent as any

function packsData() {
  return [
    { id: 1, name: 'Fun', is_builtin: true, is_owner: false, stickers: [] },
    { id: 2, name: 'Mine', is_builtin: false, is_owner: true, stickers: [] },
  ]
}

let host: HTMLDivElement
let root: Root

function renderPicker() {
  act(() => {
    root.render(React.createElement(StickerPicker, { onSelect: () => {} }))
  })
}

function setField(el: HTMLInputElement, v: string) {
  act(() => {
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openMaker() {
  renderPicker()
  await act(async () => {})
  act(() => {
    host.querySelector('button[aria-label="Make a sticker with AI"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  packsMock.mockResolvedValue({ success: true, data: packsData() })
  recentMock.mockResolvedValue({ success: true, data: [] })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('StickerMaker', () => {
  it('generates art and saves it into a new pack', async () => {
    ;(aiApi.generateImage as any).mockResolvedValue({
      success: true, data: { image_url: 'https://img.example.com/cat.png' },
    })
    ;(stickerApi.createPack as any).mockResolvedValue({ success: true, data: { id: 9 } })
    ;(stickerApi.addSticker as any).mockResolvedValue({ success: true, data: { id: 31 } })
    await openMaker()
    setField(host.querySelector('#sticker-prompt') as HTMLInputElement, 'sleepy cat')
    await act(async () => {
      host.querySelector('button[aria-label="Generate sticker image"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(aiApi.generateImage).toHaveBeenCalledTimes(1)
    expect(host.querySelector('img[src="https://img.example.com/cat.png"]')).not.toBeNull()
    setField(host.querySelector('#sticker-pack-name') as HTMLInputElement, 'Cats')
    // The refreshed pack list picks up the new pack and activates it.
    packsMock.mockResolvedValue({
      success: true,
      data: [...packsData(), { id: 9, name: 'Cats', is_builtin: false, is_owner: true, stickers: [] }],
    })
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Save sticker')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})
    expect(stickerApi.createPack).toHaveBeenCalledWith('Cats')
    expect(stickerApi.addSticker).toHaveBeenCalledWith(9, { image_url: 'https://img.example.com/cat.png' })
    expect(host.textContent).toContain('Cats')
  })

  it('saves into an existing own pack without creating one', async () => {
    ;(aiApi.generateImage as any).mockResolvedValue({ data: { image_url: 'https://img.example.com/dog.png' } })
    ;(stickerApi.addSticker as any).mockResolvedValue({ success: true, data: { id: 32 } })
    await openMaker()
    expect(host.querySelector('#sticker-prompt'), 'maker prompt renders').not.toBeNull()
    setField(host.querySelector('#sticker-prompt') as HTMLInputElement, 'dog')
    await act(async () => {
      host.querySelector('button[aria-label="Generate sticker image"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const sel = host.querySelector('#sticker-pack') as HTMLSelectElement
    act(() => {
      sel.value = '2'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Save sticker')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(stickerApi.createPack).not.toHaveBeenCalled()
    expect(stickerApi.addSticker).toHaveBeenCalledWith(2, { image_url: 'https://img.example.com/dog.png' })
  })

  it('surfaces generation and save failures honestly', async () => {
    ;(aiApi.generateImage as any).mockRejectedValueOnce(new Error('busy'))
    await openMaker()
    setField(host.querySelector('#sticker-prompt') as HTMLInputElement, 'x')
    await act(async () => {
      host.querySelector('button[aria-label="Generate sticker image"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Could not generate')
    expect(host.querySelector('#sticker-pack-name')).toBeNull()
    ;(aiApi.generateImage as any).mockResolvedValue({ data: { image_url: 'https://img.example.com/y.png' } })
    await act(async () => {
      host.querySelector('button[aria-label="Generate sticker image"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    ;(stickerApi.createPack as any).mockRejectedValueOnce(new Error('down'))
    setField(host.querySelector('#sticker-pack-name') as HTMLInputElement, 'P')
    await act(async () => {
      Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Save sticker')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Could not save')
  })

  it('builtin packs never appear as save targets', async () => {
    ;(aiApi.generateImage as any).mockResolvedValue({ data: { image_url: 'https://img.example.com/z.png' } })
    await openMaker()
    setField(host.querySelector('#sticker-prompt') as HTMLInputElement, 'z')
    await act(async () => {
      host.querySelector('button[aria-label="Generate sticker image"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const opts = Array.from(host.querySelectorAll('#sticker-pack option')).map(o => (o as HTMLOptionElement).textContent)
    expect(opts).not.toContain('Fun')
    expect(opts).toContain('Mine')
  })
})
