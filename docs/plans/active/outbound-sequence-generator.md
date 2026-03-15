# LinkedIn Outbound Sequence Generator

## Context

MVRX Labs needs AI-generated LinkedIn outbound sequences for HeyReach campaigns. Each generation produces 3 sequence structures × 2 A/B variants = 6 testable sequences.

## What Was Built

### New Files

| File                                             | Purpose                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `src/trigger/outbound-sequence.ts`               | Main Trigger.dev task — 5-step workflow                             |
| `src/lib/outbound-sequence/schema.ts`            | TypeScript types for sequence content                               |
| `src/lib/outbound-sequence/constants.ts`         | Banned phrases, char limits, sequence structures, reference example |
| `src/lib/outbound-sequence/generation-prompt.ts` | System prompt for Claude sequence generation                        |
| `src/lib/outbound-sequence/review-prompt.ts`     | Review agent prompt (quality, slop check, char limits)              |
| `src/lib/outbound-sequence/builder.ts`           | DOCX builder — cover page + per-sequence sections                   |

### Modified Files

| File                                           | Change                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/api-schemas/tools.ts`                 | New schema: accountId (required), targetIcp, valueProp, senderContactId, toneNotes |
| `src/lib/types.ts`                             | Updated tool config with new fields (contact picker, textareas)                    |
| `src/app/api/tools/outbound-sequence/route.ts` | Replaced createToolHandler stub with full Trigger.dev dispatch                     |
| `src/components/sidebar.tsx`                   | Changed `dev: true` → `beta: true`                                                 |

### Task Workflow (5 steps)

1. **Load context** — account, sender contact, LinkedIn profile data
2. **Research ICP** — Claude agent (Sonnet) with WebSearch/WebFetch researches ICP challenges, industry trends, conversation starters
3. **Generate sequences** — Claude agent (Opus) reads research JSON, generates 3 sequences × 2 variants following strict copy rules
4. **Review quality** — Claude agent (Sonnet) checks character limits, banned phrases, phone test, variant differentiation
5. **Build & upload** — DOCX assembled and uploaded to Google Drive

### Sequence Structures

- **Full (7-9 steps, ~24 days):** Connection request → value DMs → engagement → pitch → breakup
- **Medium (5-6 steps, ~15 days):** Connection → value → engage → social proof → breakup
- **Short (3-4 steps, ~13 days):** Connection → value hit → CTA → breakup

### Copy Quality System

- 40+ banned AI slop phrases hard-coded as constraints
- Per-step tone calibration (curious peer → thoughtful colleague → direct → lighthearted)
- Character limits enforced (300 for connection requests, 400 target / 600 max for DMs)
- "Phone test" — would a real person type this on their phone?
- Reference sequence from 60x HeyReach doc embedded as few-shot example

## What's NOT Included (Future Work)

- HeyReach API integration (push sequences directly into campaigns)
- Lead list segmentation and ICP-per-campaign mapping
- Per-lead message personalization using audit/GTM data
- Reply tracking and performance analytics
- Voice note / video touchpoint generation

## Verification

1. Select an account with contacts in the portal
2. Fill in Target ICP and Value Proposition
3. Run the tool — should complete in ~5-10 minutes
4. Check Google Drive for the generated DOCX
5. Verify: 3 sequences, 2 variants each, no AI slop, char limits respected
