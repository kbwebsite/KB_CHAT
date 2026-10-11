/** Read-aloud (Text-to-Speech) via the browser Web Speech API.
 * Zero backend: speech happens on-device. Long texts are capped. */

export function speechSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  } catch {
    return false
  }
}

export function stopSpeak(): void {
  try {
    window.speechSynthesis?.cancel()
  } catch {}
}

/** Speak text; returns false when unsupported. `onEnd` fires when done. */
export function speakText(text: string, onEnd?: () => void): boolean {
  try {
    const synth = window.speechSynthesis
    if (!synth) return false
    synth.cancel()
    const clean = (text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    if (!clean) return false
    const Ctor =
      (window as any).SpeechSynthesisUtterance || (window as any).webkitSpeechSynthesisUtterance
    if (!Ctor) return false
    const u = new Ctor(clean)
    u.rate = 1
    if (onEnd) {
      u.onend = onEnd
      u.onerror = onEnd
    }
    synth.speak(u)
    return true
  } catch {
    return false
  }
}
