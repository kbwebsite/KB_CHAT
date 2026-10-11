import { describe, expect, it } from 'vitest'
import { stageForXp, petMood } from '../pet'
import { computeWeather } from '../chatWeather'

describe('group pet stages', () => {
  it('starts as egg', () => {
    expect(stageForXp(0).id).toBe('egg')
    expect(stageForXp(9).id).toBe('egg')
  })
  it('evolves at thresholds', () => {
    expect(stageForXp(10).id).toBe('baby')
    expect(stageForXp(30).id).toBe('teen')
    expect(stageForXp(70).id).toBe('adult')
    expect(stageForXp(150).id).toBe('legend')
    expect(stageForXp(999).id).toBe('legend')
  })
  it('reports next stage xp', () => {
    expect(stageForXp(0).next_stage_xp).toBe(10)
    expect(stageForXp(999).next_stage_xp).toBe(null)
  })
  it('moods follow recent chatter', () => {
    expect(petMood(0).label).toBe('sleepy')
    expect(petMood(3).label).toBe('content')
    expect(petMood(25).label).toBe('playful')
  })
})

describe('chat weather', () => {
  const now = Date.now()
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString()
  const m = (content: string, minsAgo = 5) => ({ content, created_at: iso(minsAgo) })

  it('is calm with no messages', () => {
    expect(computeWeather([]).kind).toBe('calm')
  })
  it('detects sunny buzz', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => m(`party time ${i} 🎉`))
    expect(computeWeather(msgs, now).kind).toBe('sunny')
  })
  it('detects storm in heated debates', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => m(`sandai kovam fight ${i} 😡`))
    expect(computeWeather(msgs, now).kind).toBe('storm')
  })
  it('detects rain in low mood', () => {
    const msgs = [m('sad miss you 😢'), m('crying bad day 😭'), m('hate this 😞')]
    expect(computeWeather(msgs, now).kind).toBe('rain')
  })
  it('ignores stale messages', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => m(`old buzz ${i}`, 60 * 25))
    expect(computeWeather(msgs, now).kind).toBe('calm')
  })
})
