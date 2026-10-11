// Chat weather: ambient vibe from recent chatter. 100% local — no backend,
// no tracking. Activity (msgs/hour over the loaded window) + a tiny
// lexicon sentiment scan (English + common Tanglish + emoji).

export interface ChatWeather {
  kind: 'storm' | 'sunny' | 'cloudy' | 'rain' | 'calm'
  emoji: string
  label: string
}

const POS_WORDS = [
  'happy', 'love', 'congrats', 'congratulations', 'super', 'awesome',
  'great', 'nice', 'jolly', 'fun', 'party', 'win', 'won', 'birthday',
  'thanks', 'thank', 'welcome', 'good', 'best', 'lol', 'haha',
  'semma', 'jolly', 'mass', 'vera level',
]
const POS_EMOJI = ['😂', '❤️', '🧡', '🎉', '🥳', '😍', '👍', '🙏', '😊', '😋', '🔥', '⭐', '💯']
const NEG_WORDS = [
  'sad', 'angry', 'hate', 'fight', 'stupid', 'idiot', 'shut up',
  'sandai', 'kovam', 'tension', 'problem', 'complaint', 'spam',
  'boring', 'worst', 'bad', 'cry', 'crying', 'miss',
]
const NEG_EMOJI = ['😡', '😢', '😭', '👿', '💔', '😞', '😤', '🤬']

function scoreText(text: string): number {
  const t = (text || '').toLowerCase()
  if (!t) return 0
  let s = 0
  for (const w of POS_WORDS) if (t.includes(w)) s += 1
  for (const w of NEG_WORDS) if (t.includes(w)) s -= 1
  for (const e of POS_EMOJI) if (t.includes(e)) s += 1
  for (const e of NEG_EMOJI) if (t.includes(e)) s -= 1
  return s
}

export function computeWeather(msgs: any[], now: number = Date.now()): ChatWeather {
  const list = (msgs || []).filter(Boolean)
  if (list.length === 0) return { kind: 'calm', emoji: '🌙', label: 'Quiet skies' }
  const dayAgo = now - 24 * 3600 * 1000
  const recent = list.filter((m: any) => {
    const t = m?.created_at ? new Date(m.created_at).getTime() : 0
    return t >= dayAgo
  })
  const sentiment = recent.reduce((a: number, m: any) => a + scoreText(m?.content), 0)
  const n = recent.length
  if (n >= 15 && sentiment < 0) return { kind: 'storm', emoji: '⛈️', label: 'Stormy — heated debate' }
  if (n >= 15) return { kind: 'sunny', emoji: '☀️', label: 'Sunny — buzzing chat' }
  if (sentiment >= 3) return { kind: 'sunny', emoji: '🌤️', label: 'Sunny — good vibes' }
  if (sentiment <= -3) return { kind: 'rain', emoji: '🌧️', label: 'Rainy — low mood' }
  if (n >= 5) return { kind: 'cloudy', emoji: '⛅', label: 'Cloudy — steady chatter' }
  if (n === 0) return { kind: 'calm', emoji: '🌙', label: 'Quiet skies' }
  return { kind: 'cloudy', emoji: '☁️', label: 'Cloudy — light breeze' }
}
