/** Murder-mystery night: an AI-hosted (or fully manual) whodunit in chat.
 * Challenge: `🎮MYS:new:<pack>\n<flavor>` (visible card).
 * Moves (all hidden markers, same pipe as the other games):
 *   `🎮MYS:clue:<roomId>:<n>`       — reveal clue n
 *   `🎮MYS:accuse:<roomId>:<s>`     — accuse suspect s
 *   `🎮MYS:done:<roomId>`           — close the case
 * Rules: first correct accusation wins. Two wrong accusations locks you
 * out (strikes). Anyone can reveal the next clue.
 */

export const MYS_NEW_PREFIX = '🎮MYS:new'
export const MYS_CLUE_PREFIX = '🎮MYS:clue:'
export const MYS_ACCUSE_PREFIX = '🎮MYS:accuse:'
export const MYS_DONE_PREFIX = '🎮MYS:done:'

export const MYS_WRONG_OUT = 2

export interface MysPack {
  id: string
  title: string
  story: string
  suspects: string[]
  clues: string[]
  killer: number
}

export const MYS_PACKS: MysPack[] = [
  {
    id: 'manor',
    title: 'The Midnight Manor',
    story: 'A stormy night, a locked manor, and the host found cold at dawn. Five guests, one killer.',
    suspects: ['🕯️ Butler Ames', '💍 Widow Vera', '🎩 Doctor Hale', '🌹 Actress Ruby', '🧭 Hunter Cole'],
    clues: [
      'The study door was locked from the INSIDE — the key is missing.',
      'Ames polished silver till midnight, but his gloves are stained red.',
      'Vera inherits everything… if the will signed yesterday stands.',
      'Hale prescribed the host sleeping drops. The bottle is empty.',
      'Ruby was heard arguing about a blackmail letter at 11 PM.',
      'Cole\'s boots are muddy — but he claims he never left his room.',
    ],
    killer: 3,
  },
  {
    id: 'train',
    title: 'Murder on the Mail Train',
    story: 'The night mail rattles north. By the border, the guard is gone — and carriage 3 hides a secret.',
    suspects: ['🎫 Conductor Bly', '☕ Vendor Mina', '📻 Engineer Osei', '🧳 Heiress June', '🐕 Porter Sam'],
    clues: [
      'The brake was pulled between stations — someone wanted the train to stop.',
      'Bly\'s punch is missing ticket #13. The guard held #13.',
      'Mina sold coffee all night, but her cart never reached carriage 3.',
      'Osei\'s log shows the engine idled 9 minutes — unlogged.',
      'June\'s luggage is tagged for a station the train never serves.',
      'Sam\'s dog barks only at one door: the luggage van.',
    ],
    killer: 1,
  },
  {
    id: 'ship',
    title: 'Secrets of the Coral Queen',
    story: 'Three days out of port, the captain vanishes mid-gala. The ship sails on — with a killer aboard.',
    suspects: ['⚓ First Mate Ilya', '🍸 Singer Pearl', '🔧 Cook Babu', '💰 Merchant Zane', '📿 Astrologer Nox'],
    clues: [
      'The captain\'s cabin was tidied — by someone who never tidies.',
      'Ilya logged a course change at 2 AM nobody ordered.',
      'Pearl\'s final song ended early; she was seen crying on deck.',
      'Babu served the captain\'s dinner — extra salt, he says.',
      'Zane\'s deal dies if the ship reaches port on schedule.',
      'Nox predicted "the sea takes a leader" — yesterday morning.',
    ],
    killer: 4,
  },
]

export function mysPack(id: string | null | undefined): MysPack {
  return MYS_PACKS.find((p) => p.id === id) || MYS_PACKS[0]
}

/** True for a murder-mystery card. */
export function isMysChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(MYS_NEW_PREFIX)
}

/** True for any hidden mystery marker. */
export function isMysMove(text: unknown): boolean {
  return (
    typeof text === 'string' &&
    (text.startsWith(MYS_CLUE_PREFIX) ||
      text.startsWith(MYS_ACCUSE_PREFIX) ||
      text.startsWith(MYS_DONE_PREFIX))
  )
}

/** Pack id carried on the challenge first line, or null. */
export function parseMysPackId(content: unknown): string | null {
  if (typeof content !== 'string' || !isMysChallenge(content)) return null
  const first = content.split('\n')[0]
  const m = /^🎮MYS:new:([\w-]+)/.exec(first)
  return m ? m[1] : null
}

const CLUE_RE = /^🎮MYS:clue:(-?\d+):(\d+)/m
const ACCUSE_RE = /^🎮MYS:accuse:(-?\d+):(\d+)/m
const DONE_RE = /^🎮MYS:done:(-?\d+)/m

export interface MysAccuse {
  senderId: number | null
  senderName: string
  suspect: number
  id: number
}

export interface MysState {
  clues: number[]
  accuses: MysAccuse[]
  done: boolean
}

/** Reduced room state: revealed clues, accusations in order, closed or not. */
export function collectMys(roomId: number, msgs: any[]): MysState {
  const clues: number[] = []
  const accuses: MysAccuse[] = []
  let done = false
  for (const m of msgs || []) {
    if (!m || m.is_deleted || typeof m.content !== 'string') continue
    let mt = CLUE_RE.exec(m.content)
    if (mt && Number(mt[1]) === roomId) {
      const n = Number(mt[2])
      if (!clues.includes(n)) clues.push(n)
      continue
    }
    mt = ACCUSE_RE.exec(m.content)
    if (mt && Number(mt[1]) === roomId) {
      accuses.push({
        senderId: m.sender_id ?? null,
        senderName: m.sender_display_name || m.sender_username || 'Someone',
        suspect: Number(mt[2]),
        id: m.id ?? 0,
      })
      continue
    }
    mt = DONE_RE.exec(m.content)
    if (mt && Number(mt[1]) === roomId) done = true
  }
  clues.sort((a, b) => a - b)
  accuses.sort((a, b) => a.id - b.id)
  return { clues, accuses, done }
}

/** Wrong accusations by one player (strikes). */
export function mysStrikes(accuses: MysAccuse[], senderId: number | null, killer: number): number {
  if (senderId == null) return 0
  return accuses.filter((a) => a.senderId === senderId && a.suspect !== killer).length
}

/** First correct accusation, if any. */
export function mysWinner(accuses: MysAccuse[], killer: number): MysAccuse | null {
  return accuses.find((a) => a.suspect === killer) || null
}

/** Lowest unrevealed clue index, or -1 when all are out. */
export function mysNextClue(revealed: number[], total: number): number {
  for (let i = 0; i < total; i++) if (!revealed.includes(i)) return i
  return -1
}
