/** Slash commands: parsing, validation, output shapes. */
import { describe, expect, it } from 'vitest'
import { parseSlashCommand, SLASH_HELP } from '../slashCommands'

describe('parseSlashCommand', () => {
  it('ignores plain text and unknown commands', () => {
    expect(parseSlashCommand('hello')).toBeNull()
    expect(parseSlashCommand('/dinner at 8')).toBeNull()
    expect(parseSlashCommand('/frobnicate')).toBeNull()
    expect(parseSlashCommand('')).toBeNull()
    expect(parseSlashCommand(null as any)).toBeNull()
  })

  it('flips a coin', () => {
    const r = parseSlashCommand('/flip')
    expect(r?.kind).toBe('send')
    expect(['🪙 Heads', '🪙 Tails']).toContain((r as any).text)
  })

  it('shrugs, with or without text', () => {
    expect(parseSlashCommand('/shrug')).toEqual({ kind: 'send', text: '¯\\_(ツ)_/¯' })
    expect(parseSlashCommand('/shrug oh well')).toEqual({ kind: 'send', text: '¯\\_(ツ)_/¯ oh well' })
  })

  it('answers 8-ball questions from the list', () => {
    const r = parseSlashCommand('/8ball will it rain?')
    expect(r?.kind).toBe('send')
    expect((r as any).text).toMatch(/^🎱 will it rain\?\n8-ball says: .+/)
    expect(parseSlashCommand('/8ball')?.kind).toBe('hint')
    expect(parseSlashCommand('/8ball   ')?.kind).toBe('hint')
  })

  it('rolls dice notation with valid ranges', () => {
    const d20 = parseSlashCommand('/roll d20')
    expect(d20?.kind).toBe('send')
    const v = parseInt((d20 as any).text.split(': ')[1], 10)
    expect(v).toBeGreaterThanOrEqual(1)
    expect(v).toBeLessThanOrEqual(20)

    const two = parseSlashCommand('/roll 2d6')
    expect(two?.kind).toBe('send')
    expect((two as any).text).toMatch(/^🎲 Rolled 2d6: \d+ \+ \d+ = \d+$/)
    const parts = (two as any).text.match(/(\d+) \+ (\d+) = (\d+)/)!.slice(1).map(Number)
    expect(parts[0] + parts[1]).toBe(parts[2])

    const pct = parseSlashCommand('/roll 100')
    expect(pct?.kind).toBe('send')
    expect((pct as any).text).toMatch(/^🎲 Rolled 1–100: \d+$/)

    expect(parseSlashCommand('/roll')?.kind).toBe('send') // default d6
  })

  it('rejects bad dice with usage hints', () => {
    expect(parseSlashCommand('/roll abc')?.kind).toBe('hint')
    expect(parseSlashCommand('/roll 0d6')?.kind).toBe('hint')
    expect(parseSlashCommand('/roll 21d6')?.kind).toBe('hint')
    expect(parseSlashCommand('/roll 2d1')?.kind).toBe('hint')
    expect(parseSlashCommand('/roll 2d101')?.kind).toBe('hint')
  })

  it('is case-insensitive and answers /help', () => {
    expect(parseSlashCommand('/FLIP')?.kind).toBe('send')
    expect(parseSlashCommand('/Roll D20')?.kind).toBe('send')
    expect(parseSlashCommand('/help')).toEqual({ kind: 'hint', text: SLASH_HELP })
  })
})
