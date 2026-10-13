// Deactivated-account panel: contact link + appeal request flow.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  configApi: { get: vi.fn() },
  moderationApi: { appeal: vi.fn() },
}))

import { DeactivatedAppeal } from '../DeactivatedAppeal'
import { configApi, moderationApi } from '../../services/api'

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

function render(email = 'amy@example.com') {
  act(() => {
    root.render(React.createElement(DeactivatedAppeal, { email }))
  })
}

describe('DeactivatedAppeal', () => {
  it('explains the block and shows the admin contact', async () => {
    ;(configApi.get as any).mockResolvedValue({ data: { supportEmail: 'owner@example.com' } })
    render()
    expect(host.textContent).toContain('Your account is deactivated')
    await act(async () => {})
    const mail = host.querySelector('a[href^="mailto:"]') as HTMLElement
    expect(mail).not.toBeNull()
    expect(mail.getAttribute('href')).toContain('owner@example.com')
  })

  it('hides contact when unconfigured and sends the appeal', async () => {
    ;(configApi.get as any).mockResolvedValue({ data: {} })
    ;(moderationApi.appeal as any).mockResolvedValue({ success: true })
    render()
    await act(async () => {})
    expect(host.querySelector('a[href^="mailto:"]')).toBeNull()
    const box = host.querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      box.focus()
      // jsdom lacks native value setter tracking; set via prototype.
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(box, 'Sorry!')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const btn = host.querySelector('button[type="submit"]') as HTMLElement
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(moderationApi.appeal).toHaveBeenCalledWith('amy@example.com', 'Sorry!')
    expect(host.textContent).toContain('Request received')
  })
})
