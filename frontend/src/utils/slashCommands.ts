/** Slash commands: `/roll 2d6`, `/flip`, `/8ball …`, `/shrug`, `/help`.
 * Parsed client-side in ChatView before send — the server stores plain
 * text, so history, search, export and notifications all just work. */

export type SlashResult = { kind: 'send'; text: string } | { kind: 'hint'; text: string }

const BALL_ANSWERS = [
  'It is certain',
  'Without a doubt',
  'Yes, definitely',
  'Most likely',
  'Outlook good',
  'Signs point to yes',
  'Reply hazy — try again',
  'Ask again later',
  'Cannot predict now',
  'Concentrate and ask again',
  "Don't count on it",
  'My reply is no',
  'Outlook not so good',
  'Very doubtful',
  'Absolutely not',
  'The stars say yes',
  'Nope, not today',
  'Likely, but be patient',
  'Yes — go for it',
  'Hmm… maybe',
]

export const SLASH_HELP =
  'Commands: /roll 2d6 · /flip · /8ball <question> · /shrug · /help'

function rollDice(count: number, sides: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    out.push(1 + Math.floor(Math.random() * sides))
  }
  return out
}

export function parseSlashCommand(raw: string): SlashResult | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null
  const space = trimmed.indexOf(' ')
  const cmd = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase()
  const arg = (space === -1 ? '' : trimmed.slice(space + 1)).trim()

  if (cmd === '/help') {
    return { kind: 'hint', text: SLASH_HELP }
  }
  if (cmd === '/flip') {
    return { kind: 'send', text: `🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}` }
  }
  if (cmd === '/shrug') {
    return { kind: 'send', text: arg ? `¯\\_(ツ)_/¯ ${arg}` : '¯\\_(ツ)_/¯' }
  }
  if (cmd === '/8ball' || cmd === '/eightball') {
    if (!arg) return { kind: 'hint', text: 'Ask something: /8ball will it rain today?' }
    const answer = BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)]
    return { kind: 'send', text: `🎱 ${arg}\n8-ball says: ${answer}` }
  }
  if (cmd === '/roll') {
    const spec = (arg || 'd6').replace(/\s+/g, '')
    const bare = /^(\d{1,3})$/.exec(spec)
    if (bare) {
      // Bare number like "/roll 100": percent-style 1–N roll.
      const max = parseInt(bare[1], 10)
      if (max < 2 || max > 100) {
        return { kind: 'hint', text: 'Roll 1–20 dice with 2–100 sides: /roll 2d6' }
      }
      return { kind: 'send', text: `🎲 Rolled 1–${max}: ${1 + Math.floor(Math.random() * max)}` }
    }
    const m = /^(\d{0,2})d(\d{1,3})$/i.exec(spec)
    if (!m) return { kind: 'hint', text: 'Usage: /roll 2d6  ·  /roll d20  ·  /roll 100' }
    const count = m[1] === '' ? 1 : parseInt(m[1], 10)
    const sides = parseInt(m[2], 10)
    if (!(count >= 1 && count <= 20) || !(sides >= 2 && sides <= 100)) {
      return { kind: 'hint', text: 'Roll 1–20 dice with 2–100 sides: /roll 2d6' }
    }
    const dice = rollDice(count, sides)
    const total = dice.reduce((a, b) => a + b, 0)
    const label = `${count}d${sides}`
    const text =
      count === 1 ? `🎲 Rolled ${label}: ${total}` : `🎲 Rolled ${label}: ${dice.join(' + ')} = ${total}`
    return { kind: 'send', text }
  }
  // Unknown /word: leave it as plain text ("/dinner at 8" is dinner, not dice).
  return null
}
