/**
 * LinkedIn hook templates for structural inspiration during post generation.
 * Each template favors short, intriguing, curiosity-driven hooks over formulaic or technical ones.
 */

export interface HookTemplate {
  name: string;
  template: string;
  example: string;
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    name: "Quiet Confession",
    template: "Admit something personal that opens a story.",
    example: "I sat on this for three months.\nTurns out I was the problem.",
  },
  {
    name: "Wrong All Along",
    template: "Reveal you had something backwards.",
    example: "I had it completely backwards.\nThe answer was there the whole time.",
  },
  {
    name: "Nobody Mentions",
    template: "Point out what everyone avoids saying.",
    example: "Nobody mentions the part after launch.\nThat's where it gets interesting.",
  },
  {
    name: "Accidental Find",
    template: "Something happened by accident that shifted your view.",
    example: "Found this by accident last Tuesday.\nNow I can't unsee it.",
  },
  {
    name: "One Sentence Shift",
    template: "A single moment or sentence that reframed everything.",
    example: "One question from a new hire.\nRewired how I think about this.",
  },
  {
    name: "The Uncomfortable Bit",
    template: "Name the thing people avoid discussing.",
    example: "This is the part people skip.\nProbably because it's embarrassing.",
  },
  {
    name: "Years to See It",
    template: "Something obvious that took too long to realize.",
    example: "Took me six years to see it.\nIt was obvious the entire time.",
  },
  {
    name: "The Weird Part",
    template: "Highlight something counterintuitive or strange.",
    example: "The weird part?\nIt worked better when we stopped trying.",
  },
  {
    name: "The Honest Version",
    template: "Offer the real story behind a polished narrative.",
    example: "Here's the honest version.\nIt wasn't a strategy. It was panic.",
  },
  {
    name: "Small Crack",
    template: "A tiny detail that revealed something much larger.",
    example: "One line in a customer email.\nUnraveled our entire approach.",
  },
  {
    name: "Against Every Instinct",
    template: "Did the opposite of what felt right.",
    example: "Every instinct said keep going.\nStopping was the smartest move.",
  },
  {
    name: "The Gap",
    template: "Point out a disconnect between appearance and reality.",
    example: "What people see: a clean launch.\nWhat it took: nine rewrites and a fight.",
  },
  {
    name: "Before I Knew",
    template: "Reference a time before a key realization.",
    example: "Three months ago this didn't exist.\nNow it runs everything.",
  },
  {
    name: "Something Someone Said",
    template: "A conversation that stuck with you.",
    example: "My co-founder said something last week.\nI can't stop thinking about it.",
  },
  {
    name: "Still Thinking",
    template: "Something unexpectedly stayed with you.",
    example: "This shouldn't have stuck with me.\nBut here I am, still on it.",
  },
  {
    name: "Stopped Doing the Thing",
    template: "Quit a common practice with unexpected results.",
    example: "I stopped doing the obvious thing.\nThree weeks later, everything improved.",
  },
  {
    name: "The Part They Skip",
    template: "Reveal the hidden side of something visible.",
    example: "The part nobody shows you?\nSix months of nothing before it clicked.",
  },
  {
    name: "Almost Didn't",
    template: "Nearly missed something that mattered.",
    example: "I almost didn't send that message.\nGlad I did.",
  },
  {
    name: "Worst Became Best",
    template: "Something bad that turned out to be valuable.",
    example: "Our worst quarter taught us the most.\nNot the lesson you'd expect.",
  },
  {
    name: "The Real Question",
    template: "Reframe a common question into the one that matters.",
    example: "Everyone asks how we grew.\nBetter question: why did we almost quit?",
  },
  {
    name: "Two Truths",
    template: "Two things that seem contradictory but are both true.",
    example: "We're growing and I'm worried.\nBoth are true.",
  },
  {
    name: "Stripped Down",
    template: "Reduce something complex to its simplest form.",
    example: "Stripped it down to one question.\nEverything else was noise.",
  },
  {
    name: "Hindsight",
    template: "Something only visible looking back.",
    example: "Looking back, the signs were obvious.\nWe just weren't paying attention.",
  },
  {
    name: "Unexpected Teacher",
    template: "Learned something from an unlikely source.",
    example: "A customer complaint taught me more\nthan any strategy book I've read.",
  },
  {
    name: "The Walk-Away Moment",
    template: "A moment where walking away was the real move.",
    example: "I walked out of the meeting early.\nBest decision I made that quarter.",
  },
  {
    name: "What I'd Tell Myself",
    template: "Advice you'd give a past version of yourself.",
    example: "I'd tell my younger self one thing.\nStop building what nobody asked for.",
  },
  {
    name: "The Silence",
    template: "When saying nothing was more powerful than speaking.",
    example: "I said nothing for the whole call.\nThey signed the next morning.",
  },
  {
    name: "Behind the Number",
    template: "A human story hiding behind a metric or result.",
    example: "Behind that growth number?\nA team that nearly fell apart twice.",
  },
  {
    name: "It Clicked Late",
    template: "A moment of delayed understanding.",
    example: "It finally clicked last Thursday.\nI'd been solving the wrong problem.",
  },
  {
    name: "The Quiet Change",
    template: "A small, unremarkable change with outsized impact.",
    example: "We changed one tiny thing.\nThe results were absurd.",
  },
];

/**
 * Select a random subset of hook templates for inspiration.
 */
export function getRandomHookTemplates(count: number = 5): HookTemplate[] {
  const n = Math.min(count, HOOK_TEMPLATES.length);
  const pool = [...HOOK_TEMPLATES];
  for (let i = pool.length - 1; i > pool.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(-n);
}

/**
 * Format selected hook templates as a string for prompt injection.
 */
export function formatHookTemplatesForPrompt(hooks: HookTemplate[]): string {
  return hooks
    .map((h, i) => `${i + 1}. **${h.name}**\n   Pattern: ${h.template}\n   Example: ${h.example}`)
    .join("\n\n");
}
