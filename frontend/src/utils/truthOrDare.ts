/**
 * Truth-or-Dare party game, played through chat messages.
 * Spin:  `🎮TOD:spin:<challengeId>:<truth|dare>:<index>`
 * Done:  `🎮TOD:done:<challengeId>`
 * Card text derives from the shared deck + index, so both sides render
 * the identical card without extra transport. `done` marks mark completions
 * (scoreboard); spins are the turn signal (latest spinner holds the dare).
 */

export type TodKind = 'truth' | 'dare'

export const TRUTHS: string[] = [
  'What is the most embarrassing song on your playlist?',
  'Have you ever re-gifted a present? What was it?',
  'What is the silliest argument you have ever had?',
  'What did you want to be at age 7?',
  'What is your most-used emoji and why?',
  'Have you ever talked to yourself in public? What happened?',
  'What is the worst haircut you have ever had?',
  'Which cartoon character are you most like?',
  'What is a secret talent nobody here knows about?',
  'What is the funniest text you sent to the wrong person?',
  'If you could swap lives with anyone here for a day, who?',
  'What is the strangest dream you remember?',
  'What food combination do you love that others hate?',
  'Have you ever laughed at the wrong moment? When?',
  'What was your most awkward first meeting with someone here?',
]

export const DARES: string[] = [
  'Send a voice note singing the chorus of any song.',
  'Type your next 3 messages with your eyes closed.',
  'Send a selfie with the funniest face you can make.',
  'Speak only in emojis for the next 5 minutes.',
  'Call a friend right now and compliment them out of nowhere.',
  'Do 10 jumping jacks and send proof.',
  'Text your crush “hey” — screenshot optional but legendary.',
  'Send a photo of what is immediately to your left.',
  'Talk in rhyme for your next 3 messages.',
  'Send the last photo in your camera roll (keep it clean!).',
  'Do your best impression of someone in this chat via voice note.',
  'Stack three things on your head and send a photo.',
  'Send a voice note whispering a dramatic movie line.',
  'Change your display name to something silly for an hour.',
  'Describe the group chat as a movie trailer in one message.',
]

const TOD_SPIN_PREFIX = '🎮TOD:new'
const SPIN_RE = /^🎮TOD:spin:(-?\d+):(truth|dare):(\d+)/m
const DONE_RE = /^🎮TOD:done:(-?\d+)/m

export function isTodChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(TOD_SPIN_PREFIX)
}

export interface TodSpin {
  kind: TodKind
  index: number
  senderId?: number | null
  senderName?: string
}

export function parseTodSpin(text: string, challengeId: number): TodSpin | null {
  const m = SPIN_RE.exec(text || '')
  if (!m || Number(m[1]) !== challengeId) return null
  const deck = m[2] === 'truth' ? TRUTHS : DARES
  const index = Number(m[3]) % deck.length
  return { kind: m[2] as TodKind, index }
}

export function parseTodDone(text: string, challengeId: number): boolean {
  const m = DONE_RE.exec(text || '')
  return !!m && Number(m[1]) === challengeId
}

export function todCardText(spin: TodSpin): string {
  const deck = spin.kind === 'truth' ? TRUTHS : DARES
  return deck[spin.index % deck.length]
}

export interface TodState {
  spins: Array<TodSpin & { senderId: number | null; senderName: string }>
  dones: Array<{ senderId: number | null; senderName: string }>
}

/** Replay history into spins + completions (id order, challenge-scoped). */
export function collectTod(challengeId: number, msgs: any[]): TodState {
  const spins: TodState['spins'] = []
  const dones: TodState['dones'] = []
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const s = parseTodSpin(m.content || '', challengeId)
    if (s) {
      spins.push({
        ...s,
        senderId: m.sender_id ?? null,
        senderName: m.sender_display_name || m.sender_username || 'Someone',
      })
      continue
    }
    if (parseTodDone(m.content || '', challengeId)) {
      dones.push({
        senderId: m.sender_id ?? null,
        senderName: m.sender_display_name || m.sender_username || 'Someone',
      })
    }
  }
  return { spins, dones }
}

/** Scoreboard: completions per player, most recent first. */
export function todScores(state: TodState): Array<{ name: string; count: number }> {
  const map = new Map<string, number>()
  for (const d of state.dones) map.set(d.senderName, (map.get(d.senderName) ?? 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
