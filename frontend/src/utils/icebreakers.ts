// Icebreaker deck: curated conversation starters, grouped by vibe.
// Fully local (works offline); the sheet upgrades to one AI-generated
// question when the agent backend answers, else stays on the deck.

export interface IcebreakerCategory {
  id: string
  label: string
  questions: string[]
}

export const ICEBREAKER_CATEGORIES: IcebreakerCategory[] = [
  {
    id: 'fun',
    label: 'Fun & light',
    questions: [
      'If you could have dinner with any fictional character, who is it?',
      'What is the most useless talent you are secretly proud of?',
      'Which movie can you quote word for word?',
      'If your week had a theme song, what would play right now?',
      'What is the best street food you have ever had?',
      'If you won a weekend trip anywhere, where would you go?',
      'What is one small thing that instantly improves your day?',
      'Which app on your phone would you defend to the end?',
    ],
  },
  {
    id: 'deep',
    label: 'Go deeper',
    questions: [
      'What is something you believed as a kid that turned out wrong?',
      'When did you last surprise yourself?',
      'What is a skill you want to be known for in five years?',
      'What is the best advice someone gave you that you ignored at first?',
      'Which memory do you replay when you need courage?',
      'What does a perfect ordinary day look like for you?',
      'What is something you changed your mind about recently?',
      'What are you quietly working on these days?',
    ],
  },
  {
    id: 'friends',
    label: 'Friends & family',
    questions: [
      'What is our funniest shared memory?',
      'If we started a silly tradition today, what should it be?',
      'Which photo of us always makes you laugh?',
      'What should we cook together next time?',
      'If we had a free Saturday together, what is the plan?',
      'What is one thing you have always wanted to ask me?',
      'Who in our circle tells the best stories?',
      'What trip should we finally stop postponing?',
    ],
  },
  {
    id: 'groups',
    label: 'Groups & work',
    questions: [
      'Describe this week in one word — what is yours?',
      'What is everyone watching or reading right now?',
      'What is the best lunch spot near you — and why?',
      'Share one win from this week, however small — what is yours?',
      'If our group had a mascot, what would it be?',
      'What is a productivity trick that actually works for you?',
      'Weekend plans — who is doing something interesting?',
      'What should our group try together this month?',
    ],
  },
]

/** Random question, optionally from one category. Never empty. */
export function randomIcebreaker(categoryId?: string | null): { category: IcebreakerCategory; question: string } {
  const pool =
    (categoryId && ICEBREAKER_CATEGORIES.find((c) => c.id === categoryId)) || null
  const pickFrom = (cat: IcebreakerCategory) =>
    cat.questions[Math.floor(Math.random() * cat.questions.length)]
  if (pool) return { category: pool, question: pickFrom(pool) }
  const cat = ICEBREAKER_CATEGORIES[Math.floor(Math.random() * ICEBREAKER_CATEGORIES.length)]
  return { category: cat, question: pickFrom(cat) }
}
