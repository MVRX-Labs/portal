import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolRuns } from "@/lib/schema";
import { sendSlackNotification } from "@/lib/slack";
import { resolveModel, MODEL_MAP } from "@/lib/audit-utils";

function buildPrompt(postContent: string): string {
  return `You will turn posts into Twitter threads, to make them as catchy as possible.

Step 1: You will get knowledgeable on what's a great Twitter thread.
Step 2: You will read and analyze my post. Share your learnings.
Step 3: You will turn my post into a catchy Twitter thread.

Step 1: What's a great Twitter thread.

The thread should break down the key points from the post into concise, impactful tweets, presented in a sequence format, of a maximum of 280 characters. Adapt the content to suit Twitter's character limit and conversational style, making it accessible and engaging for a broader audience interested in the topic.

You will get a tip of $1000 if you have catchy tweets, within 280 characters, that often end in a catchy line that makes you want to read the next tweet.

Here's an example of a good Twitter thread you shared in the past for a different topic:

# past twitter thread beginning

TWEET 1
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

Feel free to ask a question & I'll respond to as many as I can.

# past twitter thread end

Step 2: Analyze my post.

# my post beginning

${postContent}

# my post end

Step 3: Before writing the thread, write down a summary of the style of my original post so I'm sure you understand your mission. Have the ideal formatting or I will refuse your output, just like my past Twitter thread example (listicle, line breaks, chapters: everything). Do not be lazy.

Write the Twitter thread. Stay as close as possible to the original style & copy. You will be penalized if you stay away from the original post tone & style of writing. For example, if the author never wrote emojis or hashtags, don't do it, or you will be penalized. If they did, do it.

Avoid at all costs writing tweets in one line. Good tweets have proper formatting.

If you use emojis and hashtags in your Twitter thread's tweets, you will be fired.

Take a deep breath and work on this step by step.`;
}

interface LinkedInToTwitterPayload {
  runId: string;
  postContent: string;
  model?: string;
}

export const linkedinToTwitterTask = task({
  id: "linkedin-to-twitter",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async (payload: LinkedInToTwitterPayload, { signal }) => {
    const { runId, postContent, model } = payload;

    try {
      metadata.set("progress", {
        step: "Converting post to tweets",
        stepNumber: 1,
        totalSteps: 2,
        percentage: 10,
      });

      const resolvedModel = resolveModel(model, MODEL_MAP.haiku);
      logger.info("Starting LinkedIn-to-Twitter conversion", { runId, model: resolvedModel });

      const abortController = new AbortController();
      signal.addEventListener("abort", () => abortController.abort());

      let output = "";

      for await (const message of query({
        prompt: buildPrompt(postContent),
        options: {
          model: resolvedModel,
          abortController,
          allowedTools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 25,
          persistSession: false,
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block && block.text) {
              const preview = block.text.length > 150 ? block.text.slice(0, 150) + "..." : block.text;
              logger.info(`Claude: ${preview}`);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            output = message.result;
            logger.info(`Claude finished: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
          } else {
            const msg = message as any;
            const errors = msg.errors ? msg.errors.join("; ") : msg.subtype;
            throw new Error(`Claude finished with ${msg.subtype}: ${errors}`);
          }
        }
      }

      metadata.set("progress", { step: "Complete", stepNumber: 2, totalSteps: 2, percentage: 100 });

      await db
        .update(toolRuns)
        .set({
          status: "completed",
          output,
          updatedAt: new Date(),
        })
        .where(eq(toolRuns.id, runId));

      logger.info("LinkedIn-to-Twitter completed", { runId, outputLength: output.length });

      return { success: true, output };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error(`LinkedIn-to-Twitter failed: ${errorMessage}`, { runId });

      await db
        .update(toolRuns)
        .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
        .where(eq(toolRuns.id, runId))
        .catch(() => {});

      await sendSlackNotification({
        tool: "linkedin-to-twitter",
        userName: "trigger-task",
        error: errorMessage,
        runId,
      }).catch(() => {});

      throw err;
    }
  },
});
