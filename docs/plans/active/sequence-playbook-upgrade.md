# Sequence Playbook Upgrade

**Goal:** Transform "LinkedIn Outbound Sequences" (copy-only doc) into "LinkedIn Outbound Sequence Playbook" — a full strategy + execution plan + sequences document matching the golden example (Odin playbook).

**Status:** Implemented

---

## Summary of Changes

The current tool generates 3 length-based sequences (Full/Medium/Short) with 2 A/B variants each. The golden example is a comprehensive playbook with:

- Benchmark expectations
- Client positioning guidance
- Sequences mapped to audience segments (not lengths)
- A/B/C variants (3, not 2) with testing hypotheses
- Structural A/B tests (timing/flow variations)
- Capacity model and rollout plan
- Statistical significance methodology
- Lead list analysis (when data available)

---

## Phase 1: Schema & Data Model

### File: `src/lib/outbound-sequence/schema.ts`

**Changes:**

1. Add `variantC` (and `variantCChars`) to `SequenceStep`
2. Add `testingHypothesis` to steps (what the A/B/C test measures)
3. Change `Sequence.id` from `"full" | "medium" | "short"` to `string` (audience-segment-based)
4. Add `audienceSegment` and `audienceWarmth` to `Sequence` (cold/warm/hot)
5. Add `connectionRequestStrategy` to `Sequence` (blank-only vs A/B test blank-vs-note)
6. New top-level fields on `OutboundSequenceContent`:
   - `positioningGuidance: string` — how to frame the client in messaging
   - `connectionRequestRationale: string` — why blank vs note
   - `structuralTests: StructuralTestConfig` — Standard vs Aggressive flow definitions
   - `additionalTestVariables: TestVariable[]` — future test ideas table
   - `testSequencingPlan: string` — Round 1/2/3 phased approach
   - `capacityModel: CapacityModel | null` — account limits, ramp-up (null if no lead list data)
   - `leadListInventory: LeadList[] | null` — available lists (null if not provided)
   - `leadTiering: LeadTier[] | null` — how leads are tiered
   - `weeklyRollout: WeeklyRolloutEntry[] | null` — week-by-week plan
   - `statisticalNotes: string | null` — sample size context (null if no lead data)
   - `deduplicationRules: string | null` — cross-list handling
7. Remove `variantStrategy` (replaced by per-step `testingHypothesis` + sequence-level `connectionRequestStrategy`)

**New types to add:**

```ts
interface StructuralTestConfig {
  standardDescription: string;
  aggressiveDescription: string;
  comparisonTable: { variable: string; standard: string; aggressive: string }[];
  howToRun: string;
}

interface TestVariable {
  variable: string;
  whatWeTest: string;
}

interface CapacityModel {
  accountCount: number;
  weeklyBreakdown: { week: string; perAccount: number; total: number; cumulative: number; phase: string }[];
}

interface LeadList {
  name: string;
  rawLeads: number | string;
  usableLeads: number | string;
  status: string;
  startWeek: string;
}

interface LeadTier {
  list: string;
  tier: string;
  criteria: string;
  estimatedVolume: number | string;
  role: string;
}

interface WeeklyRolloutEntry {
  week: string;
  capacity: number | string;
  whatWeSend: string;
  testRunning: string;
}
```

---

## Phase 2: Constants & Templates

### File: `src/lib/outbound-sequence/constants.ts`

**Changes:**

1. Remove the 3 fixed `SEQUENCE_STRUCTURES` (Full/Medium/Short) — sequences are now audience-segment-driven, defined by the AI based on inputs
2. Keep character limits, banned phrases, tone calibration
3. Add `BENCHMARKS_TEMPLATE` — the "What Good Looks Like" table content (static, same every time):

```
Audience Type | Conn. Accept Rate | Message Reply Rate | Context
Warm / semi-warm | 45–59% | 25–30% | Best case
Targeted cold (good messaging) | 30–40% | 15–25% | Where we aim
Generic cold (weak messaging) | 15–25% | 5–10% | Industry average
```

Plus the MVRX track record paragraph.

4. Add `STRUCTURAL_TESTS_TEMPLATE` — Standard vs Aggressive comparison table (static):

```
Variable | Structure A (Standard) | Structure B (Aggressive)
Pre-connect warmup | View profile + like post, then connect next day | Connect immediately, no warmup
Time to first message | 3 days after acceptance | Same day as acceptance
Follow-up gap | 5 days between Msg 1 and Msg 2 | 3 days between Msg 1 and Msg 2
Breakup timing | 7 days after Msg 2 (Day 16 total) | 5 days after Msg 2 (Day 9 total)
Total sequence length | ~16 days | ~9 days
```

5. Add `ADDITIONAL_TEST_VARIABLES_TEMPLATE` — future test ideas (static)
6. Add `STATISTICAL_SIGNIFICANCE_TEMPLATE` — sample size table + decision framework (static, but with lead-count-specific guidance when data available)
7. Add `DECISION_FRAMEWORK_TEMPLATE` — what to do based on results (static)
8. Update `REFERENCE_SEQUENCE_EXAMPLE` to use the Odin golden example format instead of the current anonymous 9-step one

---

## Phase 3: Generation Prompt

### File: `src/lib/outbound-sequence/generation-prompt.ts`

**Major rewrite.** Key changes:

1. **Input interface** — add optional fields:
   - `audienceSegments?: string[]` — user-defined segments
   - `leadListSummary?: string` — parsed from uploaded file or user description
   - `senderAccountCount?: number` — number of LinkedIn accounts available

2. **Prompt structure changes:**
   - Instruct AI to generate sequences **per audience segment**, not per length
   - If segments provided: use them directly
   - If lead list provided but no segments: infer segments from list data
   - If neither: infer 3 reasonable segments from ICP description
   - Each sequence should have a **connection request strategy** (blank vs A/B test) based on audience warmth
   - Generate **A/B/C variants** for all message steps in each sequence (follow-ups and breakups included, since sequences are per-segment and variants should stay coherent with their opening angle)
   - Add **"What we're testing"** annotation per variant set
   - Generate **positioning guidance** (how to frame the client)
   - Generate **connection request rationale** (why blank vs note for each sequence)
   - Generate **test sequencing plan** (phased rollout guidance)
   - If lead list data available: generate capacity model, lead tiering, weekly rollout, statistical notes, deduplication rules
   - If no lead list data: these fields should be null, and the document will use template placeholders

3. **Include golden example reference** — embed a condensed version of the Odin Sequence 1 as a structural reference (not the full playbook, just enough to show format expectations)

4. **Output JSON schema** — updated to match new `OutboundSequenceContent` type

---

## Phase 4: Review Prompt

### File: `src/lib/outbound-sequence/review-prompt.ts`

**Changes:**

1. Update character limit checks for 3 variants (A/B/C)
2. Add check: variants should test meaningfully different hypotheses
3. Add check: follow-up/breakup variants stay coherent with their opening angle
4. Add check: connection request strategy should match audience warmth
5. Add check: positioning guidance should be concrete, not generic
6. Verify structural test recommendations make sense for the audience

---

## Phase 5: Document Builder

### File: `src/lib/outbound-sequence/builder.ts`

**Major additions.** New sections to build in order:

1. **Cover page** — update title to "LinkedIn Outbound Sequence Playbook", update subtitle to "HeyReach Sequence Playbook", update summary line
2. **Benchmarks section** — "What Good Looks Like: LinkedIn Outbound Benchmarks" with the standard benchmark table + MVRX track record paragraph + target goals
3. **Positioning section** — "{Client}'s Positioning in Messaging"
4. **Connection request strategy** — "Connection Requests: No Note as Default" with rationale
5. **Proposed Sequences overview** — brief intro listing all sequences
6. **Structural A/B tests** — Standard vs Aggressive table, how to run the test, additional variables table, sequencing plan
7. **Capacity model** (if lead data) — weekly capacity table
8. **Lead list inventory** (if lead data) — what we have right now table
9. **Lead tiering** (if lead data) — tiering table
10. **Weekly rollout** (if lead data) — week-by-week plan table
11. **Per-sequence sections** — for each audience segment:
    - Sequence title with audience context
    - Step flow table (same as current but with Structure A/B timing columns)
    - Connection request A/B test (if applicable) with "What we're testing"
    - Message variants (A/B/C) with "What we're testing" for each message step
    - Follow-up and breakup messages also get A/B/C variants (coherent with their opening angle)
12. **Statistical significance** (if lead data) — sample size table + decision framework
13. **Appendix: Lead Lists** (if lead data) — detailed breakdowns
14. **Deduplication rules** (if lead data)
15. **Generation notes** — keep existing
16. **Sign-off** — keep existing

For sections conditional on lead data: when no data is provided, render them with template guidance text (e.g., "Once lead lists are provided, this section will include specific capacity planning. For now, here are the standard LinkedIn account limits and ramp-up guidelines...")

**Builder helper changes:**

- `messageBlock` needs to support 3 variants
- New helper for "What we're testing" annotation blocks
- New helper for multi-column comparison tables (Standard vs Aggressive)

---

## Phase 6: API & Frontend

### File: `src/lib/api-schemas/tools.ts`

Add optional fields to `outboundSequenceBodySchema`:

- `audienceSegments: z.string().optional()` — comma-separated or newline-separated segment descriptions
- `leadListDescription: z.string().optional()` — text description of available lead lists
- `senderAccountCount: z.number().optional()` — number of LinkedIn sender accounts

(File upload for lead list CSV is a stretch goal — for now, accept a text description of the lists.)

### File: `src/lib/types.ts`

Update tool config:

- Change name to "LinkedIn Outbound Sequence Playbook"
- Change description to reflect playbook output
- Add new form fields:
  - `audienceSegments` (textarea, optional) — "Define your audience segments..."
  - `leadListDescription` (textarea, optional) — "Describe your available lead lists..."
  - `senderAccountCount` (number, optional) — "How many LinkedIn sender accounts?"

### File: `src/trigger/outbound-sequence.ts`

- Pass new fields through to generation prompt
- Update filename to `MVRX | {accountName} | LinkedIn Outbound Sequence Playbook.docx`

---

## Phase 7: Update Existing Plan & References

- Move `docs/plans/active/outbound-sequence-generator.md` to `docs/plans/completed/`
- Update sidebar label if needed

---

## Implementation Order

1. Schema changes (Phase 1) — foundation for everything else
2. Constants/templates (Phase 2) — static content ready for builder
3. Generation prompt (Phase 3) — most complex, drives output quality
4. Review prompt (Phase 4) — quick update
5. Builder (Phase 5) — most code, but straightforward once schema is set
6. API & frontend (Phase 6) — wiring up new inputs
7. Cleanup (Phase 7)

**Estimated file changes:** 7 files modified, 0 new files.

---

## Key Design Decisions

1. **Lead data is optional.** The playbook is useful without it (strategic sections render with template guidance). This means the tool is immediately usable without requiring CSV upload infrastructure.

2. **Audience segments drive sequences, not length.** The AI determines appropriate sequence length per segment based on audience warmth (cold = more touches, warm = fewer).

3. **A/B/C variants on all message steps.** Follow-ups and breakups should be variant-specific since sequences are per-segment and each variant's angle should stay coherent throughout.

4. **Templated strategic sections.** Benchmarks, structural tests, statistical significance, and decision framework are largely static content. This keeps the AI focused on generating good copy rather than reinventing boilerplate.

5. **Text input for lead lists (not file upload).** File upload adds complexity across API, frontend, and trigger task for marginal benefit. A text description gives the AI enough to work with. File upload can be added later.
