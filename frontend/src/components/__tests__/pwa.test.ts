// PWA: offline banner visibility + install section states.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'

import { OfflineBanner } from '../OfflineBanner'
import { PwaInstallSection } from '../PwaInstallSection'

let host: HTMLDivElement
let root: Root

function render(el: React.ReactElement) {
  act(() => {
    root.render(el)
  })
}

function setOnline(value: boolean) {
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
  act(() => {
    root.unmount()
  })
  host.remove()
})

describe('OfflineBanner', () => {
  it('stays hidden while online', () => {
    render(React.createElement(OfflineBanner))
    expect(host.querySelector('[role="status"]')).toBeNull()
  })

  it('appears on offline and clears on reconnect', () => {
    render(React.createElement(OfflineBanner))
    setOnline(false)
    const pill = host.querySelector('[role="status"]')
    expect(pill).not.toBeNull()
    expect(pill?.textContent).toMatch(/offline/i)
    setOnline(true)
    expect(host.querySelector('[role="status"]')).toBeNull()
  })
})

describe('PwaInstallSection', () => {
  it('explains unavailability when no prompt exists', () => {
    render(React.createElement(PwaInstallSection))
    expect(host.textContent).toMatch(/isn't offered/i)
  })

  it('offers Install once the browser prompt event fires', () => {
    render(React.createElement(PwaInstallSection))
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'))
    })
    const btn = host.querySelector('button')
    expect(btn?.textContent).toMatch(/Install app/)
  })
})
