// Command palette: Broadcast lists entry dispatches the sidebar event.
import { describe, expect, it } from 'vitest'

import { buildCommands } from '../CommandPalette'

const noop = () => {}

describe('buildCommands', () => {
  it('routes Broadcast lists through kb:open-broadcasts', () => {
    const seen: string[] = []
    const onEvent = (e: Event) => seen.push(e.type)
    window.addEventListener('kb:open-broadcasts', onEvent)
    try {
      const cmds = buildCommands({
        onNewChat: noop,
        onNewGroup: noop,
        onNewStatus: noop,
        onSettings: noop,
        onSaved: noop,
        onCalls: noop,
        onNotifications: noop,
        onToggleTheme: noop,
        onLogout: noop,
      })
      const entry = cmds.find((c) => c.id === 'broadcasts')
      expect(entry?.label).toBe('Broadcast lists')
      entry?.action()
      expect(seen).toEqual(['kb:open-broadcasts'])
    } finally {
      window.removeEventListener('kb:open-broadcasts', onEvent)
    }
  })

  it('keeps the expected command set intact', () => {
    const cmds = buildCommands({
      onNewChat: noop,
      onNewGroup: noop,
      onNewStatus: noop,
      onSettings: noop,
      onSaved: noop,
      onCalls: noop,
      onNotifications: noop,
      onToggleTheme: noop,
      onLogout: noop,
    })
    expect(cmds.map((c) => c.id)).toContain('saved')
    expect(cmds.length).toBeGreaterThan(9)
  })
})
