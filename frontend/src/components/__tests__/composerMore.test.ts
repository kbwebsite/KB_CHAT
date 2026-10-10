/**
 * Mobile ＋ sheet: the extras panel must anchor to the full composer width.
 * Regression: it used to live inside the tiny ＋ button box with
 * `absolute bottom-12 left-2 right-2`, which collapsed it into a thin
 * vertical icon strip floating over the messages (options unreadable).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  uploadApi: { upload: vi.fn() },
  liveLocationApi: { start: vi.fn() },
}))

vi.mock('../../services/websocket', () => ({
  default: { sendTyping: vi.fn() },
}))

import { MessageComposer } from '../MessageComposer'

let host: HTMLDivElement
let root: Root

function renderComposer() {
  act(() => {
    root.render(
      React.createElement(MessageComposer, {
        onSend: () => {},
        onTyping: () => {},
        conversationId: 1,
        onCancelReply: () => {},
      }),
    )
  })
}

function click(el: Element | null) {
  expect(el).not.toBeNull()
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
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
})

describe('MessageComposer mobile more-actions sheet', () => {
  it('opens a full-width sheet anchored to the composer wrapper', () => {
    renderComposer()
    expect(host.querySelector('[data-testid="more-actions-sheet"]')).toBeNull()
    click(host.querySelector('button[aria-label="More actions"]'))

    const sheet = host.querySelector('[data-testid="more-actions-sheet"]')
    expect(sheet).not.toBeNull()
    // Buttons visible inside the opened sheet.
    expect(sheet!.querySelector('button[aria-label="View once"]')).not.toBeNull()

    // The sheet must be a direct child of the composer wrapper so its
    // left/right insets span the composer — not nested in the ＋ button box.
    expect(sheet!.parentElement!.classList.contains('composer-wrapper')).toBe(true)
    expect(sheet!.className).toContain('left-2')
    expect(sheet!.className).toContain('right-2')
  })

  it('dismisses on outside tap', () => {
    renderComposer()
    click(host.querySelector('button[aria-label="More actions"]'))
    expect(host.querySelector('[data-testid="more-actions-sheet"]')).not.toBeNull()

    click(host.querySelector('button[aria-label="Close more actions"]'))
    expect(host.querySelector('[data-testid="more-actions-sheet"]')).toBeNull()
    expect(host.querySelector('button[aria-label="Close more actions"]')).toBeNull()
  })
})
