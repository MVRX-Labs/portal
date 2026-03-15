/**
 * Prompt presets for the LinkedIn-to-Twitter conversion tool.
 *
 * Shared between the frontend (so the prompt text is visible/editable in the UI)
 * and the trigger task (which does the actual conversion).
 *
 * All templates use {{POST}} as a placeholder for the LinkedIn post content.
 */

const THREAD_EXAMPLE = `TWEET 1
Today, my little one-person business crossed $5M in revenue.

That was my big goal when I started on August 1st, 2019.

It took 1,548 days, I ran zero ads & operate at a 92% margin.

Here are the 20 steps of my wild & strange journey:

Hope they are helpful to someone ↓

TWEET 2
1/ Created lots of noise

When I was just getting started, I looked at attention as my friend.

I wrote content every day before I even had a business, just to find my voice.

I started on LinkedIn.

I shared my thoughts & observations about building a SaaS unicorn as the CRO.

TWEET 3
2/ Honed in on signals

Inside all of that noise? Signal.

Sometimes I bombed, and sometimes I struck a chord.

The more I looked at what resonated, the more I doubled down.

This allowed me to understand what people cared about.

So, I kept writing & talking about it.

TWEET 4

3/ Built a service business

My experience building SaaS was resonating. So I began creating more and more content about that.

Founders sent me DMs asking questions.

I responded to every single one.

Once I had prospects in my funnel, I started consulting.

TWEET 5
4/ Found my ideal customers

Inside your customer base are more signals.

What are the commonalities between the customers you love & those who love you?

Mine were early-stage SMB SaaS in the healthcare space. A space I was experienced in & loved.

My new ideal customer.

TWEET 6
One last note:

While this thread might be easy to read, none of this was actually easy.

- It's taken ~4+ years & 4,500 pieces of content
- There are days when I think it's all going away
- I'm an outlier - the creator game is tough

Does that mean you shouldn't try? No.

TWEET 7
You should have a very "long game" mentality.

1. Start a side project.
2. Build it to 60% of your salary
3. Then go all in.

Good luck! I'm rooting for you.

Thanks for taking some of your time to read this today.

Feel free to ask a question & I'll respond to as many as I can.`;

export interface PromptPreset {
  label: string;
  description: string;
  template: string;
}

export const TWITTER_PROMPT_PRESETS: Record<string, PromptPreset> = {
  default: {
    label: "Engaging & Punchy",
    description: "The original prompt — catchy threads that stay close to the author's style.",
    template: `You will turn posts into Twitter threads, to make them as catchy as possible.

Step 1: You will get knowledgeable on what's a great Twitter thread.
Step 2: You will read and analyze my post. Share your learnings.
Step 3: You will turn my post into a catchy Twitter thread.

Step 1: What's a great Twitter thread.

The thread should break down the key points from the post into concise, impactful tweets, presented in a sequence format, of a maximum of 280 characters. Adapt the content to suit Twitter's character limit and conversational style, making it accessible and engaging for a broader audience interested in the topic.

You will get a tip of $1000 if you have catchy tweets, within 280 characters, that often end in a catchy line that makes you want to read the next tweet.

Here's an example of a good Twitter thread you shared in the past for a different topic:

# past twitter thread beginning

${THREAD_EXAMPLE}

# past twitter thread end

Step 2: Analyze my post.

# my post beginning

{{POST}}

# my post end

Step 3: Before writing the thread, write down a summary of the style of my original post so I'm sure you understand your mission. Have the ideal formatting or I will refuse your output, just like my past Twitter thread example (listicle, line breaks, chapters: everything). Do not be lazy.

Write the Twitter thread. Stay as close as possible to the original style & copy. You will be penalized if you stay away from the original post tone & style of writing. For example, if the author never wrote emojis or hashtags, don't do it, or you will be penalized. If they did, do it.

Avoid at all costs writing tweets in one line. Good tweets have proper formatting.

If you use emojis and hashtags in your Twitter thread's tweets, you will be fired.

Take a deep breath and work on this step by step.`,
  },

  human: {
    label: "Human & Conversational",
    description: "Sounds like a real person typed it — casual, imperfect, no AI-speak.",
    template: `You will convert a LinkedIn post into a Twitter thread that sounds like a real human wrote it — not an AI, not a marketer, not a corporate account. It should read like someone typing their genuine thoughts.

# Your rules for sounding human

- Use contractions naturally: "don't", "can't", "I've", "it's", "won't"
- Vary sentence length dramatically. Mix short punchy fragments with medium sentences. One word on its own line sometimes. Then a longer thought.
- Write like you talk. Read each tweet aloud — if it sounds like a press release or essay, rewrite it.
- Use casual punctuation: dashes for asides — like this. Ellipses for trailing thoughts... Rhetorical questions.
- Add personal reactions and opinions: "this blew my mind", "I was dead wrong about this", "honestly?"
- Use specific concrete details instead of vague abstractions
- Start sentences with "And" or "But" sometimes. Use fragments. Real people do this.
- NEVER use these AI-flagged words: delve, tapestry, landscape, comprehensive, multifaceted, cutting-edge, revolutionary, leverage (as verb), navigate (metaphorical), "it's important to note", "in today's ever-evolving", "in summary", "in conclusion", "furthermore", "moreover", "additionally", "testament to", "underscore"
- Avoid perfectly parallel structure — real humans don't write in perfectly balanced lists
- No corporate-speak. No LinkedIn-speak. No "I'm excited to share" or "I'm thrilled to announce"
- Absolutely no emojis or hashtags unless the original author used them

# Thread structure

- 5-7 tweets, each under 280 characters
- Each tweet = one thought. It should work on its own even if someone only sees that one tweet.
- Good formatting: line breaks between ideas within a tweet. Never a wall of text.
- The first tweet should hook — but naturally, like you're telling a friend something interesting, not writing clickbait
- End the thread by being real, not with a generic CTA

# Reference example of good formatting

${THREAD_EXAMPLE}

# The post to convert

{{POST}}

# Your process

1. First, read the post and write down the author's natural voice — are they formal? Casual? Do they use slang? Short sentences or long? Match their energy.
2. Then write the thread. Stay close to their original style and tone. If they're casual, be casual. If they're data-driven, keep the numbers.
3. After writing, review each tweet: does it sound like something a real person would actually type? If not, rewrite it until it does.`,
  },

  viral: {
    label: "Viral Thread Expert",
    description: "Engineered for maximum reach — algorithm-aware hooks, reply-driving CTAs.",
    template: `You will convert a LinkedIn post into a Twitter thread engineered for maximum engagement. Every tweet should make the reader desperate to read the next one.

# How the Twitter algorithm works (use this knowledge)

- Replies are weighted 13.5x more than likes. Replies that get author replies: 75x.
- Retweets: 20x weight. Bookmarks: 10x. Likes: only 0.5x.
- Engagement velocity in the first 30-60 minutes determines reach.
- This means: write tweets that provoke replies and conversation, not just passive likes.

# Your rules for viral threads

HOOK (Tweet 1 — this is everything):
- Create a curiosity gap. The reader MUST click to see the rest.
- Use a proven hook formula:
  * Bold claim: "Nobody talks about this, but..."
  * Pattern interrupt: "Everyone says X. They're wrong."
  * Credibility + value: "I spent $50K learning this. Here's everything (so you don't have to)."
  * Story: "3 years ago I was [bad state]. Today I'm [good state]. Here's what changed:"
  * Number + promise: "7 lessons that changed everything for me:"
- Include "Thread:" or a ↓ to signal there's more

BODY (Tweets 2-6):
- Each tweet = one discrete, valuable insight. No filler.
- Lead with the insight, not the context. Punchline first, setup second.
- Use specific numbers and data points — they outperform vague claims
- End each body tweet with a line that creates tension or curiosity for the next tweet
- Keep tweets under 200 characters when possible (leaves room for quote tweets)
- Vary the format: some tweets as mini-stories, some as sharp observations, some as contrarian takes

CLOSE (Final tweet):
- Strong call to action that drives replies: "What would you add?", "Drop your experience below", "Which one hit hardest?"
- Never end with generic "Follow for more" — ask something specific that people want to answer

# Anti-patterns to avoid
- No emojis or hashtags (unless the original author used them)
- No "I'm excited to share" or LinkedIn-speak
- No AI words: delve, leverage, navigate, comprehensive, cutting-edge, revolutionary, landscape, multifaceted
- Never write a tweet as a single long sentence. Use line breaks and formatting.
- Don't be balanced and neutral — have a point of view. Mild controversy drives replies.

# Reference example of good thread formatting

${THREAD_EXAMPLE}

# The post to convert

{{POST}}

# Your process

1. Analyze the post: what's the single most surprising, useful, or contrarian insight? That becomes your hook.
2. Extract 4-5 key points and rank them by how likely they are to provoke a reply or retweet.
3. Write the thread. Each tweet should end on a line that pulls the reader forward.
4. Review: would YOU stop scrolling to read this? If not, sharpen the hook and tighten each tweet.`,
  },
};

export type OutputFormat = "single" | "thread";

/**
 * When the user selects "Single Tweet", this modifier is appended to the
 * resolved prompt so the AI produces exactly one tweet instead of a thread.
 */
export const SINGLE_TWEET_MODIFIER = `

# IMPORTANT — OUTPUT FORMAT OVERRIDE

Ignore all previous instructions about creating a thread or multiple tweets.
Instead, produce **exactly one single tweet** (maximum 280 characters).

Rules for the single tweet:
- Distill the entire post into one punchy, self-contained tweet
- It must be under 280 characters — no exceptions
- Do NOT label it "TWEET 1" or use any thread numbering
- Do NOT add "Thread:" or ↓ arrows
- Keep the same tone and style rules from above (no emojis or hashtags unless the original author used them)
- Make it the single most compelling, shareable takeaway from the post
- Output ONLY the tweet text — nothing else (no preamble, no explanation, no alternatives)`;

/** Replace {{POST}} in a template with the actual post content. */
export function resolvePromptTemplate(
  template: string,
  postContent: string,
  outputFormat?: OutputFormat,
): string {
  let resolved = template;
  if (resolved.includes("{{POST}}")) {
    resolved = resolved.replace("{{POST}}", postContent);
  } else {
    resolved = `${resolved}\n\n# The post to convert\n\n${postContent}`;
  }

  if (outputFormat === "single") {
    resolved += SINGLE_TWEET_MODIFIER;
  }

  return resolved;
}
