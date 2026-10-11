/** Live call captions: transcribe your own mic in-browser (Web Speech API,
 * free, on-device where supported) and share the text over the existing
 * group_call WS relay. Peers render it as subtitles. No audio leaves the
 * device for captions — only the recognized words. */

export type CaptionSender = (text: string, isFinal: boolean) => void

export function captionsSupported(): boolean {
  try {
    const w = window as any
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
  } catch {
    return false
  }
}

/** Throttle interim results (finals always go through). Pure, tested. */
export function shouldSendCaption(lastSentAt: number, now: number, isFinal: boolean): boolean {
  if (isFinal) return true
  return now - lastSentAt >= 2000
}

/** Cap caption length (server truncates too; this saves bandwidth). */
export function fitCaption(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function createCaptionRecognizer(onText: CaptionSender): {
  start: () => boolean
  stop: () => void
} {
  let rec: any = null
  let stopped = false
  const Ctor = (() => {
    try {
      const w = window as any
      return w.SpeechRecognition || w.webkitSpeechRecognition || null
    } catch {
      return null
    }
  })()

  const start = (): boolean => {
    if (!Ctor) return false
    stop()
    stopped = false
    try {
      rec = new Ctor()
    } catch {
      return false
    }
    rec.continuous = true
    rec.interimResults = true
    try {
      rec.lang = navigator.language || 'en-US'
    } catch {}
    rec.onresult = (e: any) => {
      try {
        let interim = ''
        let final = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0]?.transcript || ''
          if (e.results[i].isFinal) final += t
          else interim += t
        }
        const text = (final || interim).trim()
        if (text) onText(text, !!final)
      } catch {}
    }
    // Recognition stops itself on silence/errors: keep it alive while on.
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start()
        } catch {}
      }
    }
    rec.onerror = () => {}
    try {
      rec.start()
    } catch {
      return false
    }
    return true
  }

  const stop = () => {
    stopped = true
    try {
      rec?.stop?.()
    } catch {}
    rec = null
  }

  return { start, stop }
}
