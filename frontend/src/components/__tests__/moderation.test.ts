// Moderation UI: report dialog submits through the moderation contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

vi.mock('../../services/api', () => ({
  moderationApi: { report: vi.fn() },
}))
vi.mock('../../store/toast', () => ({
  useToastStore: () => () => {},
}))

import { moderationApi } from '../../services/api'
import { ReportDialog } from '../ReportDialog'

const reportMock = moderationApi.report as any

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.resetAllMocks()
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

function renderDialog() {
  act(() => {
    root.render(
      React.createElement(ReportDialog, { messageId: 42, onClose: () => {} }),
    )
  })
}

describe('ReportDialog', () => {
  it('offers every report reason and submits the chosen one', async () => {
    reportMock.mockResolvedValueOnce({ success: true })
    renderDialog()
    const select = host.querySelector('#report-reason') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.options.length).toBe(7)
    act(() => {
      select.value = 'scam'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const submit = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit report'),
    )!
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(reportMock).toHaveBeenCalledOnce()
    expect(reportMock.mock.calls[0]).toEqual(['message', 42, 'scam', undefined])
  })

  it('surfaces server failures without closing', async () => {
    reportMock.mockRejectedValueOnce({ response: { data: { detail: 'Nope' } } })
    let closed = false
    act(() => {
      root.render(
        React.createElement(ReportDialog, {
          messageId: 42,
          onClose: () => {
            closed = true
          },
        }),
      )
    })
    const submit = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit report'),
    )!
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(closed).toBe(false)
    expect(host.querySelector('[aria-label="Report message"]')).not.toBeNull()
  })
})
