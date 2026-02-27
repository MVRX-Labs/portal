# AI Humanizer Feature Implementation Plan

## Context

The MVRX tool portal has a LinkedIn Post Humanizer listed as a tool but it's currently a stub — the UI page and API route exist but only create a "pending" DB record without dispatching to the local-api for Claude processing. The goal is to make it fully functional: take an AI-generated LinkedIn post and rewrite it to sound authentically human, with an optional "writing style examples" feature so users can provide samples of their own writing for the model to match.

Research shows that the most effective humanization approach combines: (1) few-shot examples (3-5 samples is the sweet spot), (2) explicit anti-AI vocabulary lists, (3) instructions for sentence length variation (burstiness), and (4) a two-step "analyze style then generate" technique when writing samples are provided.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `writingExamples` textarea field to linkedin-humanizer tool config |
| `src/app/api/tools/linkedin-humanizer/route.ts` | Replace generic `createToolHandler` stub with custom handler that dispatches to local-api |
| `local-api/src/routes/jobs.ts` | Add `/linkedin-humanizer` job endpoint with humanization prompt |

## Implementation Steps

### 1. Update tool config (`src/lib/types.ts`)

Add an optional `writingExamples` textarea field to the `linkedin-humanizer` tool:

```ts
{
  name: "writingExamples",
  label: "Writing Style Examples (Optional)",
  type: "textarea",
  placeholder: "Paste 3-5 examples of your writing style (e.g., past LinkedIn posts, emails, blog excerpts). The AI will analyze and match your voice.",
}
```

This goes after the existing `tone` field. Keep `required` unset (defaults to falsy).

### 2. Build the API route (`src/app/api/tools/linkedin-humanizer/route.ts`)

Replace the one-liner `createToolHandler` stub with a custom handler that:
1. Authenticates via `x-user-id` header
2. Validates `postContent` is present
3. Creates a `toolRuns` record with status `"running"`
4. Dispatches to local-api at `/api/jobs/linkedin-humanizer` with payload: `{ runId, postContent, tone, writingExamples, callbackUrl }`
5. Returns `{ id, status: "running" }` to the frontend

Follow the same pattern as `src/app/api/tools/linkedin-audit/route.ts` but without the Apify scraping step (simpler — just forward inputs to local-api).

### 3. Add the job handler (`local-api/src/routes/jobs.ts`)

Add a new `router.post("/linkedin-humanizer", ...)` endpoint that:
1. Accepts `{ runId, postContent, tone, writingExamples, callbackUrl }`
2. Returns 202 immediately
3. Calls `runClaudeJob()` with:
   - `model`: `claude-haiku-4-5-20251001` (consistent with other jobs)
   - `maxTurns`: 3 (pure text task, no tools needed)
   - `allowedTools`: `[]` (no file system access needed)
   - A detailed humanization prompt (see below)

### 4. The humanization prompt

The prompt is structured in layers based on research best practices:

**Core structure:**
```
[Identity] You are an expert LinkedIn ghostwriter who specializes in making
AI-generated posts sound authentically human.

[Anti-pattern rules]
- NEVER use these words: delve, tapestry, moreover, furthermore, comprehensive,
  robust, utilize, leverage, nuanced, crucial, significant, transformative,
  testament, authentic, enhance, ever-evolving, in conclusion, additionally,
  it's worth noting, game-changer, landscape
- Do NOT start consecutive sentences with the same word
- Do NOT use bullet points or numbered lists unless the original has them
- Do NOT use a formulaic intro-body-conclusion structure
- Vary sentence length dramatically — mix short punchy fragments with longer complex ones

[Tone guidance] Based on the selected tone (professional/casual/thought-leader/storytelling),
adjust formality, word choice, and structure accordingly.

[If writing examples provided — two-step approach]
First, analyze the provided writing samples and identify:
- Sentence structure patterns, average length
- Vocabulary preferences and signature phrases
- Tone and emotional register
- Opening/closing habits
- Any distinctive quirks

Then use that analysis to guide the rewrite, matching those specific patterns.

[Task] Rewrite the following LinkedIn post to sound like a real human wrote it.
Return ONLY the rewritten post — no commentary, no explanations, no labels.
```

**Key prompt techniques from research:**
- Explicit banned word list (the words AI detectors flag most)
- Burstiness instruction ("vary sentence length dramatically")
- Two-step analyze-then-generate when writing samples are provided
- Negative prompting (what NOT to do is as important as what to do)
- Tone-specific guidance for each of the 4 tone options

### 5. Prompt branching logic

The prompt is assembled dynamically in `jobs.ts`:
- **Base prompt** always includes: identity, anti-patterns, tone guidance, task
- **When `writingExamples` is provided**: Insert the two-step style analysis section with the examples
- **When `writingExamples` is empty**: Use the tone parameter alone for style guidance

## Architecture Notes

- The humanizer is a pure text-in/text-out task — no file system tools needed, no .docx generation, no Google Drive upload
- Output goes into the `toolRuns.output` column as plain text, displayed in the existing ToolForm success state
- The `setupSession` callback on `runClaudeJob` is not needed (no files to write to the session directory)
- `maxTurns: 3` is sufficient since there are no tool calls to iterate on
- Uses Haiku for cost efficiency — LinkedIn posts are short-form content where Haiku performs well

## Verification

1. Start the local-api (`cd local-api && npm run dev`)
2. Start ngrok tunnel and confirm `NGROK_BASE_URL` is set
3. Start the Next.js app (`npm run dev`)
4. Navigate to `/tools/linkedin-humanizer`
5. Test without writing examples: paste an AI-generated post, select a tone, submit
6. Test with writing examples: paste an AI-generated post + 3-5 writing samples, submit
7. Verify the run transitions from "running" to "completed" with humanized output text
8. Verify the output text avoids common AI words and has varied sentence structure
