# Sequence Playbook Upgrade

**Status: IMPLEMENTED**

## Goal

Transform "LinkedIn Outbound Sequences" (copy-only doc) into "LinkedIn Outbound Sequence Playbook" — a full strategy + execution plan + sequences document.

## What Was Built

The tool now generates sequences per audience segment (not per length), with A/B/C variants, positioning guidance, structural A/B tests, optional capacity planning, and statistical significance methodology.

### Key schema changes (`src/lib/outbound-sequence/schema.ts`)

- `Sequence.id` — now audience-segment-based strings (not `"full" | "medium" | "short"`)
- `SequenceStep` — added `variantC`, `testingHypothesis`
- `OutboundSequenceContent` — added `positioningGuidance`, `structuralTests`, `capacityModel`, `leadListInventory`, `weeklyRollout`, `statisticalNotes`, `deduplicationRules`

### Design decisions

1. **Audience segments drive sequences, not length.** AI determines appropriate length per segment based on warmth.
2. **A/B/C variants on all message steps.** Follow-ups and breakups stay coherent with their opening angle.
3. **Lead data is optional.** Playbook is useful without it (strategic sections render with template guidance).
4. **Text input for lead lists (not file upload).** Simpler, sufficient for AI to work with.
5. **Templated strategic sections.** Benchmarks, structural tests, statistical significance are largely static content.

### Files changed

- `src/lib/outbound-sequence/schema.ts` — new types and fields
- `src/lib/outbound-sequence/constants.ts` — benchmarks, structural tests, statistical significance templates
- `src/lib/outbound-sequence/generation-prompt.ts` — major rewrite for segment-based generation
- `src/lib/outbound-sequence/review-prompt.ts` — updated for 3 variants
- `src/lib/outbound-sequence/builder.ts` — new sections (benchmarks, positioning, structural tests, capacity, rollout)
- `src/lib/api-schemas/tools.ts` — added `audienceSegments`, `leadListDescription`, `senderAccountCount`
- `src/trigger/outbound-sequence.ts` — passes new fields, updated filename
