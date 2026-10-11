/**
 * Would-You-Rather deck: instant party polls with zero backend changes.
 * A dilemma fills the normal poll create form (editable, then Create),
 * so all validation, voting, and quiz semantics stay exactly as-is.
 */

export interface Dilemma {
  a: string
  b: string
}

export const WYR_DECK: Dilemma[] = [
  { a: 'Fly anywhere for free', b: 'Eat anywhere for free' },
  { a: 'Always be 10 minutes early', b: 'Always be 10 minutes late' },
  { a: 'Talk to animals', b: 'Speak every human language' },
  { a: 'Movie night every Friday', b: 'Game night every Friday' },
  { a: 'Beach vacation', b: 'Mountain trip' },
  { a: 'Cook dinner', b: 'Wash dishes' },
  { a: 'Morning person energy', b: 'Night owl energy' },
  { a: 'Unlimited battery', b: 'Unlimited data' },
  { a: 'Time travel to the past', b: 'Time travel to the future' },
  { a: 'Pizza for life', b: 'Biryani for life' },
  { a: 'Read minds', b: 'Turn invisible' },
  { a: 'Road trip playlist duty', b: 'Road trip snack duty' },
  { a: 'Win the lottery', b: 'Find your dream job' },
  { a: 'Summer forever', b: 'Winter forever' },
  { a: 'Text only, no calls', b: 'Calls only, no texts' },
  { a: 'Host every party', b: 'Never host, always guest' },
  { a: 'Know every song lyric', b: 'Know every movie quote' },
  { a: 'Camping under stars', b: 'Luxury hotel weekend' },
  { a: 'Early morning chai run', b: 'Midnight maggi run' },
  { a: 'Photo memory', b: 'Perfect sense of direction' },
  { a: 'Become famous overnight', b: 'Stay unknown but rich' },
  { a: 'Pause time once a day', b: 'Replay one moment a week' },
  { a: 'Group video call', b: 'Group voice call' },
  { a: 'Sweet snacks', b: 'Spicy snacks' },
]

/** Uniform deck pick; injectable RNG keeps tests deterministic. */
export function randomDilemma(rand: () => number = Math.random): Dilemma {
  const i = Math.floor(rand() * WYR_DECK.length)
  return WYR_DECK[Math.min(i, WYR_DECK.length - 1)]
}

/** Dilemma → poll draft using the exact create contract. */
export function dilemmaToPoll(d: Dilemma): { question: string; options: string[] } {
  return {
    question: 'Would you rather…',
    options: [d.a, d.b],
  }
}
