/** Read-aloud helper: speaks, caps length, degrades gracefully. */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { speakText, stopSpeak, speechSupported } from '../speech'

const RealSpeech = (window as any).speechSynthesis

function mockSynth() {
  const speak = vi.fn()
  const cancel = vi.fn()
  const utterances: any[] = []
  function Utterance(this: any, text: string) {
    this.text = text
    this.rate = 1
    this.onend = null
    this.onerror = null
    utterances.push(this)
  }
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak, cancel, utterances },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: Utterance,
    configurable: true,
    writable: true,
  })
  return { speak, cancel, utterances }
}

beforeEach(() => {
  mockSynth()
})

afterEach(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    value: RealSpeech,
    configurable: true,
    writable: true,
  })
  vi.restoreAllMocks()
})

describe('speech', () => {
  it('reports support when the API exists', () => {
    expect(speechSupported()).toBe(true)
  })

  it('speaks cleaned text and cancels the previous utterance', () => {
    const synth: any = (window as any).speechSynthesis
    const ok = speakText('  hello   world  ')
    expect(ok).toBe(true)
    expect(synth.cancel).toHaveBeenCalled()
    expect(synth.speak).toHaveBeenCalledTimes(1)
    expect(synth.utterances[0].text).toBe('hello world')
  })

  it('caps long texts at 500 chars', () => {
    speakText('x'.repeat(900))
    const synth: any = (window as any).speechSynthesis
    expect(synth.utterances[0].text).toHaveLength(500)
  })

  it('refuses empty text and stops on demand', () => {
    expect(speakText('   ')).toBe(false)
    const synth: any = (window as any).speechSynthesis
    expect(synth.speak).not.toHaveBeenCalled()
    expect(() => stopSpeak()).not.toThrow()
    expect(synth.cancel).toHaveBeenCalled()
  })
})
