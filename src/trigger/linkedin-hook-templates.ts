/**
 * 50 LinkedIn hook templates for structural inspiration during post generation.
 * Adapted from guides/linkedin/50-linkedin-hooks.md
 */

export interface HookTemplate {
  name: string;
  template: string;
  example: string;
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    name: "Belief Breaker",
    template: "I used to [belief or mistake]. Until I learned [lesson].",
    example: "I thought cold emailing didn't work. Until I signed $12,000 in 9 days.",
  },
  {
    name: "Industry Myth Buster",
    template: "The biggest lie in [industry]? [Myth to later debunk].",
    example: "The biggest lie in SaaS marketing? Paid ads deliver the highest ROI.",
  },
  {
    name: "Misconception Reveal",
    template: "I thought [personal misconception]. But [mistake to avoid].",
    example: "I thought I'd hit £10K by month 1. But this sales call error STOPPED me!",
  },
  {
    name: "Contrarian Take",
    template: "Most people: [stereotypical advice]. Me: [Less common advice].",
    example: 'Most people: "LinkedIn hooks are important". Me: Curiosity gaps are 10x more important.',
  },
  {
    name: "Client Case Study",
    template: "Here's how I helped [person] get [result]. Without [X]. Without [Y]. Just this.",
    example: "My client (SaaS Founder) signed 5 clients in 2 days. No cold DMs. No cold emails. Just this.",
  },
  {
    name: "Triple Challenge",
    template: "[Challenge 1] [Challenge 2] [Challenge 3]. Here's how [desirable transformation].",
    example: "Low following? No engagement? No proof? Here's how I'd STILL sign a client. (In ONLY 24 hours!)",
  },
  {
    name: "Better Approach",
    template: "Most people do [thing]. Here's [better approach].",
    example: "Most lead-gen coaches post daily. I post once, then distribute it 5 ways.",
  },
  {
    name: "Near Miss",
    template: "This [action] [result] [timeframe]. But I NEARLY [risk].",
    example: "This subject line 4x my email opens in 3 days. But I NEARLY didn't use it!",
  },
  {
    name: "Client Achievement",
    template: "My client [achievement] [timeframe]. [Debunk common myth].",
    example: "My client lost 6kg of pure body fat in 28 days. And NO! He didn't use weight loss pills.",
  },
  {
    name: "Identity Caller",
    template: "If you're [identity] struggling with [problem]. The next [X lines] will [positive outcome].",
    example: "If you're ADHD and struggle to time-manage... The next 9 lines will TRANSFORM your life.",
  },
  {
    name: "Reframe",
    template: "You don't need [thing]. You need [real need].",
    example: "You don't need more website traffic. You need better conversion strategies.",
  },
  {
    name: "10x Alternative",
    template: "People think [common thing] helps [desirable goal]. But [alternative action] is 10x better.",
    example: "People think testimonials boost conversions. But BEFORE vs AFTER results convert 10x more!",
  },
  {
    name: "Simple Action, Big Result",
    template: "I did [simple action]. It [desirable stat-based result].",
    example: "I changed one line in my LinkedIn headline. It increased profile traffic by 63%.",
  },
  {
    name: "Transformation Shift",
    template: "I used to [old action]. Now [better results from a new action].",
    example: "I used to think sending cold DMs was useless. Now, it's how I sign 77% of my clients!",
  },
  {
    name: "Frustration + Method",
    template: "Doing [thing], but not seeing [result]. You need to try [suggest action].",
    example: "Posting daily, but not generating leads? You need to try the RISE method!",
  },
  {
    name: "One Thing",
    template: "This ONE [action] delivered [result]. [Reduce friction].",
    example: "This ONE writing hack doubled my inbound leads. (You don't need to be a trained copywriter!)",
  },
  {
    name: "Dream Outcome + Question",
    template: "How I [dream outcome] - and how you can too. [Rhetorical question].",
    example: "How I've gained 4 hours a week - thanks to ONE tool. Want more free time in your diary?",
  },
  {
    name: "Don't Do This",
    template: "Don't [common action]. You only need [alternative action].",
    example: "Don't waste months on an 11-page website. You only need ONE clean landing page.",
  },
  {
    name: "Do One Thing",
    template: "If you want [desirable result], do one thing. [Suggestion action] not [common action].",
    example: "If you want more sales, do one thing: Sell offers, not products. (Here's the trick):",
  },
  {
    name: "Secret Reveal",
    template: "What's the secret to [desirable outcome]. This is what DID vs DIDN'T work for me!",
    example: "What's the secret to hitting 50k followers? This is what DID vs DIDN'T work for me!",
  },
  {
    name: "Growth Case Study",
    template: "[% growth]: How [brand or person] achieved it. This is [positive teasing of process].",
    example: "110% YoY Growth: How Nike Achieved It. This is their INSANE marketing hack!",
  },
  {
    name: "Contrarian Strategy",
    template: "I stopped [common strategy]. Got [result] anyway. Here's the [new strategy] that did it.",
    example: "I stopped posting on LinkedIn. Got 3 clients anyway. Here's the DM template that did it.",
  },
  {
    name: "Step Breakdown",
    template: "No [X]. No [Y]. Still [aspirational result]. Here's the [X step] breakdown.",
    example: "No pitch. No agent. Still landed TEDx. Here's my exact 5-step speaker strategy!",
  },
  {
    name: "Forget the Old Way",
    template: "Forget [traditional method]. Here's how I [result] through [new method].",
    example: "Forget wasting hours writing LinkedIn posts! Here's how I signed a £33k deal from a single DM.",
  },
  {
    name: "Success + Failure",
    template: "[Career success]. [Personal failure]. Here's what I wish I had done differently:",
    example: "Millionaire by 37. Divorced by 38. Here's what I wish I had done differently:",
  },
  {
    name: "Reverse Psychology",
    template: "Don't try [common approach] if you want [desirable goal]. I'd do this instead:",
    example: "Don't hire a team if you want to scale quickly. I'd do this instead:",
  },
  {
    name: "Behind the Scenes",
    template: "Everyone saw the [launch/win/success]. No one saw the [struggle behind it].",
    example: "Everyone saw me win this award on stage. No one saw the panic attack 4 minutes before.",
  },
  {
    name: "Stop and Start",
    template: "Stop doing [common mistake]. Do [action]. Let me explain...",
    example: "Stop focusing on building your product. Build your audience first. Let me explain...",
  },
  {
    name: "Never Shared Before",
    template: "I've never shared this [tool/strategy]. But [specific result] in [timeframe].",
    example: "I've never shared this lead-gen hack. But it boosted my pipeline by 40% in 3 days.",
  },
  {
    name: "Stuck Until",
    template: "I was stuck in [negative state] for [time]. Until I [story-led action]:",
    example: "I was stuck in burnout cycles for 7 years. Until I had this conversation with my boss:",
  },
  {
    name: "Extreme Transformation",
    template: "How I went from [negative], [negative] [negative]. To [positive] [positive] [positive]. In ONLY [time].",
    example: "How I went from fat, broke and miserable. To be healthy, happy and rich - In ONLY 90 days!",
  },
  {
    name: "Year-on-Year Contrast",
    template: "2024: [negative state]. 2025: [positive state].",
    example: "2024: Made redundant whilst 6 months pregnant. 2025: Run my own 6-figure business from home!",
  },
  {
    name: "Launch Comparison",
    template: "1st [action]: [negative outcome]. [Later action]: [positive outcome].",
    example: "1st product launch: 0 sales. 7th product launch: 1,048 sales.",
  },
  {
    name: "Shortcut Discovery",
    template: "I found a way to [result] in [time saving]. It all came down to [action].",
    example: "I found a way to close deals in 73% less time. It all came down to my automation trick!",
  },
  {
    name: "Overnight Switch",
    template: "Here's how I [achieved X] overnight. I switched to [insert action].",
    example: "Here's how I got 6 new leads overnight. I switched to an irresistible content strategy.",
  },
  {
    name: "Only Guide You Need",
    template: "Learn how to [action] in [low time]. This is the ONLY guide you need:",
    example: "Learn how to create a LinkedIn banner in 17 minutes. This is the ONLY guide you need.",
  },
  {
    name: "What Actually Matters",
    template: "What you think matters: [common tactic]. What actually matters: [alternative tactic].",
    example: "What you think matters: creating content. What actually matters: DISTRIBUTING content.",
  },
  {
    name: "Bold Action, Negative Outcome",
    template: "I [ambitious action] in [timeframe]. [Negative outcome].",
    example: "I asked for a promotion 3 months into my job. My boss laughed and said 'no'.",
  },
  {
    name: "Against the Norm",
    template: "I [action that goes against the norm]. Here's why [action] is best:",
    example: 'I said "no" and REJECTED 4 keen investors! Here\'s why bootstrapping is best:',
  },
  {
    name: "Disagree Hook",
    template: "\"You need to [common advice]\". I disagree! Here's why that's a BAD idea:",
    example: "\"You need to work for free to get your first client.\" I disagree! Here's why that's a BAD idea:",
  },
  {
    name: "Vulnerable Moment",
    template: "After [time period], I nervously [vulnerable/scary action].",
    example: "After seven months of maternity leave, I nervously asked for a meeting with my boss.",
  },
  {
    name: "Savage Truth",
    template: "Here's the savage truth about [aspiration / persona]: [uncomfortable reality / statement].",
    example: "Savage truth for wannabe hustle bros: You won't manifest your way to £1M.",
  },
  {
    name: "Age/Stage Contrast",
    template: "Most people [expected behaviour] at [age / stage]. But not [contrasting example].",
    example: "Most people slow down in their 60s. But not Christopher, my dad.",
  },
  {
    name: "Random Action, Big Story",
    template: "[Time period] ago, I [small, seemingly random action].",
    example: "11 years ago, I sent a random DM to a guy who ran a Facebook meme page.",
  },
  {
    name: "Rhetorical Agreement",
    template: 'Ask any [identity]: "Do you want [undesirable thing]?" They\'ll say no.',
    example: 'Ask any hard-working person: "Do you want to be micromanaged?" They\'ll say no.',
  },
  {
    name: "Nobody Warned Me",
    template: "Nobody warned me about [specific consequence or experience].",
    example:
      "Nobody warned me that posting on LinkedIn would lead to getting trolled by 200+ strangers in a public Reddit thread.",
  },
  {
    name: "Celebration Moment",
    template: "WHAT A [time period]!!! [Specific, impressive outcome].",
    example: "WHAT A WEEK!!! 3 of my clients just upgraded their contracts.",
  },
  {
    name: "Everyone Keeps Asking",
    template: 'Everyone keeps asking me: "[specific how-question]?"',
    example: 'Everyone keeps asking me: "How did you get 200+ people to sign up to your webinar in just 7 days?"',
  },
  {
    name: "Almost Said It",
    template: 'In [time period], I almost said: "[emotionally loaded statement]"',
    example: "In Feb last year, I came the closest I've ever been to saying: \"I'm going to close my business\"",
  },
  {
    name: "Bleak Before",
    template: "[Time period] ago, my life looked like this: [Bleak or uncertain moment].",
    example: "3 years ago, my life looked like this: Wake up -> do 9-5pm I hated -> sleep -> repeat.",
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
    .map((h, i) => `${i + 1}. **${h.name}**\n   Template: ${h.template}\n   Example: ${h.example}`)
    .join("\n\n");
}
