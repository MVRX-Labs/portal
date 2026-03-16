import { Document, Packer, Paragraph, Table, TableRow, Header, Footer, AlignmentType } from "docx";
import type { OutboundSequenceContent, Sequence, SequenceStep } from "./schema";
import {
  BENCHMARKS_TABLE,
  BENCHMARKS_BODY,
  STRUCTURAL_TESTS_TABLE,
  STRUCTURAL_TESTS_HOW_TO_RUN,
  ADDITIONAL_TEST_VARIABLES,
  TEST_SEQUENCING_PLAN,
  STATISTICAL_SIGNIFICANCE_TABLE,
  STATISTICAL_SIGNIFICANCE_BODY,
  DECISION_FRAMEWORK,
  DEFAULT_CAPACITY_MODEL,
  CAPACITY_MODEL_INTRO,
} from "./constants";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  COVER_MARGIN,
  BODY_MARGIN_TB,
  BODY_MARGIN_LR,
  FONT,
  SZ,
  C,
  numbering,
  sectionH,
  subH,
  bodyP,
  bullet,
  emptyPara,
  tr,
  hCell,
  bCell,
  makeTable,
  signOff,
  BULLET_REF,
  CONTENT_WIDTH,
} from "../growth-report/styles";

// ─── Cover Page ────────────────────────────────────────────────

function coverPage(content: OutboundSequenceContent): Paragraph[] {
  return [
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [tr("MVRX LABS", { bold: true, size: SZ.brand, color: C.brand })],
    }),
    emptyPara(),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [tr(`${content.companyName} Outbound`, { bold: true, size: SZ.title, color: C.dark })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 400 },
      children: [tr("HeyReach Sequence Playbook", { size: SZ.subtitle, color: C.gray })],
    }),
    emptyPara(),
    bodyP(`Prepared for: ${content.companyName}`),
    bodyP(`Prepared by: MVRX Labs`),
    bodyP(`Date: ${content.preparedDate}`),
    bodyP(`Classification: Confidential`),
  ];
}

// ─── Benchmarks Section ────────────────────────────────────────

function benchmarksSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(sectionH("What Good Looks Like: LinkedIn Outbound Benchmarks"));
  elements.push(
    bodyP(
      "Before getting into the sequences, it's worth grounding expectations. LinkedIn outbound performance varies hugely depending on how warm the audience is, how relevant the message is, and whether the sender has an existing presence in the space. Here's the range we typically see."
    )
  );
  elements.push(emptyPara());

  // Benchmark table
  const rows = BENCHMARKS_TABLE.map(
    (row) =>
      new TableRow({
        children: [
          bCell(row.audienceType, { w: 35 }),
          bCell(row.acceptRate, { w: 20 }),
          bCell(row.replyRate, { w: 20 }),
          bCell(row.context, { w: 25 }),
        ],
      })
  );
  elements.push(
    makeTable([35, 20, 20, 25], ["Audience Type", "Conn. Accept Rate", "Message Reply Rate", "Context"], rows)
  );
  elements.push(emptyPara());

  // Body text
  for (const para of BENCHMARKS_BODY.split("\n\n")) {
    elements.push(bodyP(para));
  }

  // Target goals
  elements.push(emptyPara());
  elements.push(
    bodyP(
      `Targets: 30%+ connection acceptance, 20%+ message reply rate. The sequences below are designed to hit those numbers by A/B/C testing the variables that move reply rates: hook angle, CTA style, and message length. We test on low-priority leads first, then graduate the winner to higher tiers.`
    )
  );

  return elements;
}

// ─── Mixed Content Renderer (paragraphs + bullets) ─────────────

/** Renders text that may contain a mix of paragraphs and bullet lines (starting with "- ") */
function renderMixedContent(text: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("- ")) {
      elements.push(bullet(trimmed.slice(2)));
    } else {
      elements.push(bodyP(trimmed));
    }
  }
  return elements;
}

// ─── Positioning Section ───────────────────────────────────────

function positioningSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(sectionH(`${content.companyName}'s Positioning in Messaging`));
  elements.push(...renderMixedContent(content.positioningGuidance));
  return elements;
}

// ─── Connection Request Strategy ───────────────────────────────

function connectionRequestSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(subH("Connection Requests: No Note as Default"));
  elements.push(...renderMixedContent(content.connectionRequestRationale));
  return elements;
}

// ─── Proposed Sequences Overview ───────────────────────────────

function proposedSequencesOverview(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(subH("Proposed Sequences"));
  elements.push(
    bodyP(
      `${content.sequences.length} sequences, each mapped to a different audience segment. Every sequence has A/B/C message variants at the touchpoints that matter most. We test on low-priority leads first, then graduate the winner to higher tiers.`
    )
  );
  return elements;
}

// ─── Structural A/B Tests ──────────────────────────────────────

function structuralTestsSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(sectionH("Sequence Structure A/B Tests"));
  elements.push(
    bodyP(
      "Message copy is only half the picture. The structure of the sequence itself matters just as much: how long you wait after acceptance before messaging, whether you view a profile before or after connecting, the number of follow-ups, the gap between them. These are separate variables that need their own tests."
    )
  );
  elements.push(emptyPara());
  elements.push(
    bodyP(
      "We propose running two structural variants per sequence. Each variant uses the same message copy (whichever wins the A/B/C copy test), but with a different flow architecture. This lets us isolate whether the structure or the copy is doing the work."
    )
  );
  elements.push(emptyPara());

  // Structural comparison table — use AI-generated data if available, otherwise template
  const compTable = content.structuralTests?.comparisonTable?.length
    ? content.structuralTests.comparisonTable
    : STRUCTURAL_TESTS_TABLE;

  const structRows = compTable.map(
    (row) =>
      new TableRow({
        children: [
          bCell(row.variable, { w: 30, bold: true }),
          bCell(row.standard, { w: 35 }),
          bCell(row.aggressive, { w: 35 }),
        ],
      })
  );
  elements.push(
    makeTable([30, 35, 35], ["Variable", "Structure A (Standard)", "Structure B (Aggressive)"], structRows)
  );
  elements.push(emptyPara());

  // How to run
  const howToRun = content.structuralTests?.howToRun || STRUCTURAL_TESTS_HOW_TO_RUN;
  elements.push(bodyP(howToRun));
  elements.push(emptyPara());

  // Additional test variables
  elements.push(subH("Additional Structural Variables to Test in Later Rounds"));

  const testVars = content.additionalTestVariables?.length
    ? content.additionalTestVariables
    : ADDITIONAL_TEST_VARIABLES;

  const testVarRows = testVars.map(
    (row) =>
      new TableRow({
        children: [bCell(row.variable, { w: 30, bold: true }), bCell(row.whatWeTest, { w: 70 })],
      })
  );
  elements.push(makeTable([30, 70], ["Variable", "What We'd Test"], testVarRows));
  elements.push(emptyPara());

  // Test sequencing
  elements.push(subH("Sequencing the Tests"));
  const seqPlan = content.testSequencingPlan || TEST_SEQUENCING_PLAN;
  elements.push(bodyP(seqPlan));

  return elements;
}

// ─── Capacity Model ────────────────────────────────────────────

function capacityModelSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(sectionH("Capacity Model & Rollout Plan"));

  const model = content.capacityModel;
  const accountCount = model?.accountCount || 2;

  elements.push(
    bodyP(
      `${CAPACITY_MODEL_INTRO} With ${accountCount} sender account${accountCount > 1 ? "s" : ""}, here's what we can push through.`
    )
  );
  elements.push(emptyPara());

  const breakdown = model?.weeklyBreakdown || DEFAULT_CAPACITY_MODEL;
  const capRows = breakdown.map(
    (row) =>
      new TableRow({
        children: [
          bCell(row.week, { w: 16 }),
          bCell(String(row.perAccount), { w: 16 }),
          bCell(String(row.total), { w: 20 }),
          bCell(String(row.cumulative), { w: 24 }),
          bCell(row.phase, { w: 24 }),
        ],
      })
  );
  elements.push(
    makeTable(
      [16, 16, 20, 24, 24],
      ["", "Per Account", `x${accountCount} Accounts`, "Cumulative Total", "Phase"],
      capRows
    )
  );

  return elements;
}

// ─── Lead List Inventory ───────────────────────────────────────

function leadListInventorySection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (content.leadListInventory?.length) {
    elements.push(subH("What We Have Right Now"));
    const rows = content.leadListInventory.map(
      (list) =>
        new TableRow({
          children: [
            bCell(list.name, { w: 30 }),
            bCell(String(list.rawLeads), { w: 15 }),
            bCell(String(list.usableLeads), { w: 25 }),
            bCell(list.status, { w: 15 }),
            bCell(list.startWeek, { w: 15 }),
          ],
        })
    );
    elements.push(
      makeTable([30, 15, 25, 15, 15], ["List", "Raw Leads", "Usable (LinkedIn match)", "Status", "Start"], rows)
    );
    elements.push(emptyPara());
  }

  return elements;
}

// ─── Lead Tiering ──────────────────────────────────────────────

function leadTieringSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (content.leadTiering?.length) {
    elements.push(subH("Natural Lead Tiering"));
    const rows = content.leadTiering.map(
      (tier) =>
        new TableRow({
          children: [
            bCell(tier.list, { w: 20 }),
            bCell(tier.tier, { w: 10 }),
            bCell(tier.criteria, { w: 30 }),
            bCell(String(tier.estimatedVolume), { w: 15 }),
            bCell(tier.role, { w: 25 }),
          ],
        })
    );
    elements.push(makeTable([20, 10, 30, 15, 25], ["List", "Tier", "Criteria", "Est. Volume", "Role"], rows));
    elements.push(emptyPara());
  }

  return elements;
}

// ─── Weekly Rollout ────────────────────────────────────────────

function weeklyRolloutSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (content.weeklyRollout?.length) {
    elements.push(subH("Week-by-Week Rollout"));
    const rows = content.weeklyRollout.map(
      (entry) =>
        new TableRow({
          children: [
            bCell(entry.week, { w: 10 }),
            bCell(String(entry.capacity), { w: 12 }),
            bCell(entry.whatWeSend, { w: 48 }),
            bCell(entry.testRunning, { w: 30 }),
          ],
        })
    );
    elements.push(makeTable([10, 12, 48, 30], ["Week", "Capacity", "What We Send", "Test Running"], rows));
    elements.push(emptyPara());
  }

  return elements;
}

// ─── Sequence Sections ─────────────────────────────────────────

function stepTypeLabel(step: SequenceStep): string {
  switch (step.type) {
    case "connection_request":
      return "Connection Request";
    case "message":
      return "Message";
    case "engage_post":
      return "Like / Engage Post";
    case "inmail":
      return "InMail";
  }
}

function stepTimingLabel(step: SequenceStep, index: number): string {
  if (index === 0) return "Day 0";
  return `+${step.delayDays} days`;
}

function sequenceOverviewTable(seq: Sequence): Table {
  const rows = seq.steps.map(
    (step, i) =>
      new TableRow({
        children: [
          bCell(String(step.stepNumber), { w: 8 }),
          bCell(stepTypeLabel(step), { w: 22 }),
          bCell(stepTimingLabel(step, i), { w: 12 }),
          bCell(step.intent, { w: 58 }),
        ],
      })
  );

  return makeTable([8, 22, 12, 58], ["Step", "Type", "Timing", "Intent"], rows);
}

function variantBlock(label: string, text: string | null, chars?: number): (Paragraph | Table)[] {
  if (text === null) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        tr(label, { bold: true, size: SZ.body, color: C.brand }),
        ...(chars ? [tr(` (${chars} chars)`, { size: SZ.dataSrc, color: C.gray })] : []),
      ],
    })
  );
  elements.push(
    new Paragraph({
      spacing: { after: 120 },
      indent: { left: 300 },
      children: [tr(text, { size: SZ.body })],
    })
  );
  return elements;
}

function testingHypothesisBlock(hypothesis: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [
      tr("What we're testing: ", { bold: true, size: SZ.body, color: C.gray }),
      tr(hypothesis, { size: SZ.body, color: C.gray, italics: true }),
    ],
  });
}

function connectionRequestAbBlock(seq: Sequence): (Paragraph | Table)[] {
  if (seq.connectionRequestStrategy !== "ab_test") return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(subH("Connection Request A/B Test"));

  // Find the connection request step
  const crStep = seq.steps.find((s) => s.type === "connection_request");
  if (!crStep) return elements;

  // Build a simple table showing the variants
  const rows: TableRow[] = [];
  if (crStep.variantA !== null) {
    rows.push(
      new TableRow({
        children: [
          bCell("A", { w: 8, bold: true }),
          bCell(crStep.variantA || "No note. Blank connection request.", { w: 92 }),
        ],
      })
    );
  } else {
    rows.push(
      new TableRow({
        children: [bCell("A", { w: 8, bold: true }), bCell("No note. Blank connection request.", { w: 92 })],
      })
    );
  }
  if (crStep.variantB) {
    rows.push(new TableRow({ children: [bCell("B", { w: 8, bold: true }), bCell(crStep.variantB, { w: 92 })] }));
  }
  if (crStep.variantC) {
    rows.push(new TableRow({ children: [bCell("C", { w: 8, bold: true }), bCell(crStep.variantC, { w: 92 })] }));
  }

  if (rows.length > 0) {
    elements.push(makeTable([8, 92], [], rows));
  }

  if (crStep.testingHypothesis) {
    elements.push(emptyPara());
    elements.push(testingHypothesisBlock(crStep.testingHypothesis));
  }

  return elements;
}

function messageVariantsTable(step: SequenceStep): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  const rows: TableRow[] = [];
  if (step.variantA !== null) {
    rows.push(new TableRow({ children: [bCell("A", { w: 5, bold: true }), bCell(step.variantA, { w: 95 })] }));
  }
  if (step.variantB !== null) {
    rows.push(new TableRow({ children: [bCell("B", { w: 5, bold: true }), bCell(step.variantB, { w: 95 })] }));
  }
  if (step.variantC !== null) {
    rows.push(new TableRow({ children: [bCell("C", { w: 5, bold: true }), bCell(step.variantC, { w: 95 })] }));
  }

  if (rows.length > 0) {
    elements.push(makeTable([5, 95], [], rows));
  }

  if (step.testingHypothesis) {
    elements.push(emptyPara());
    elements.push(testingHypothesisBlock(step.testingHypothesis));
  }

  return elements;
}

function sequenceSection(seq: Sequence, seqIndex: number): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(sectionH(`Sequence ${seqIndex + 1}: ${seq.name}`));
  elements.push(bodyP(seq.description));
  elements.push(bodyP(`Total steps: ${seq.totalSteps} | Duration: ${seq.totalDays} days`));
  elements.push(emptyPara());

  // Overview table
  elements.push(subH("Sequence Structure"));
  elements.push(sequenceOverviewTable(seq));
  elements.push(emptyPara());

  // Connection request A/B test section (if applicable)
  elements.push(...connectionRequestAbBlock(seq));

  // Step-by-step content — message steps with A/B/C variants
  const messageSteps = seq.steps.filter((s) => s.type === "message" || s.type === "inmail");

  if (messageSteps.length > 0) {
    // First message step gets full "Message 1 Variants (A/B/C)" treatment
    for (let i = 0; i < messageSteps.length; i++) {
      const step = messageSteps[i];
      const msgNum = i + 1;
      const label =
        i === 0
          ? "Message 1 Variants (A/B/C)"
          : msgNum === messageSteps.length
            ? `Message ${msgNum} (Breakup)`
            : `Message ${msgNum} (Follow-up)`;

      elements.push(emptyPara());
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [tr(label, { bold: true, size: SZ.subH, color: C.dark })],
        })
      );

      if (step.intent) {
        elements.push(bodyP(step.intent, { italics: true }));
      }

      elements.push(...messageVariantsTable(step));
    }
  }

  // Engagement steps — just note them
  const engageSteps = seq.steps.filter((s) => s.type === "engage_post");
  if (engageSteps.length > 0 && messageSteps.length > 0) {
    // Engage steps are already shown in the overview table, no need to duplicate
  }

  return elements;
}

// ─── Statistical Significance ──────────────────────────────────

function statisticalSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(sectionH("Statistical Significance: How Many Leads Per Variant?"));
  elements.push(
    bodyP(
      "Running A/B/C tests with too few leads per variant means the results are noise, not signal. Here's the minimum sample sizes needed to trust the data."
    )
  );
  elements.push(emptyPara());

  elements.push(subH("The Maths"));
  elements.push(bodyP(STATISTICAL_SIGNIFICANCE_BODY));
  elements.push(emptyPara());

  // Sample size table
  const rows = STATISTICAL_SIGNIFICANCE_TABLE.map(
    (row) =>
      new TableRow({
        children: [
          bCell(row.metric, { w: 30 }),
          bCell(row.baselineRate, { w: 15 }),
          bCell(row.minDetectableEffect, { w: 18 }),
          bCell(row.leadsPerVariant, { w: 18 }),
          bCell(row.totalForABC, { w: 19 }),
        ],
      })
  );
  elements.push(
    makeTable(
      [30, 15, 18, 18, 19],
      ["Metric", "Baseline Rate", "Min. Detectable Effect", "Leads Per Variant", "Total for A/B/C"],
      rows
    )
  );
  elements.push(emptyPara());

  // Client-specific statistical notes
  if (content.statisticalNotes) {
    elements.push(subH("What This Means In Practice"));
    elements.push(...renderMixedContent(content.statisticalNotes));
    elements.push(emptyPara());
  }

  // Decision framework
  elements.push(subH("Decision Framework"));
  const dfRows = DECISION_FRAMEWORK.map(
    (row) =>
      new TableRow({
        children: [bCell(row.scenario, { w: 35 }), bCell(row.whatToDo, { w: 35 }), bCell(row.why, { w: 30 })],
      })
  );
  elements.push(makeTable([35, 35, 30], ["Scenario", "What To Do", "Why"], dfRows));

  return elements;
}

// ─── Appendix: Lead Lists ──────────────────────────────────────

function appendixSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (!content.leadListInventory?.length && !content.deduplicationRules) return elements;

  elements.push(sectionH("Appendix: Lead Lists"));
  elements.push(
    bodyP(
      "All lists below have been analysed. MVRX will clean, tier, and cross-reference before loading into HeyReach."
    )
  );
  elements.push(emptyPara());

  // Re-render lead list details if available
  if (content.leadListInventory?.length) {
    for (const list of content.leadListInventory) {
      elements.push(
        bullet(`${list.name}: ${list.rawLeads} raw leads, ${list.usableLeads} usable. Status: ${list.status}.`)
      );
    }
    elements.push(emptyPara());
  }

  // Deduplication rules
  if (content.deduplicationRules) {
    elements.push(subH("Deduplication Across Lists"));
    elements.push(bodyP(content.deduplicationRules));
  }

  return elements;
}

// ─── Generation Notes ──────────────────────────────────────────

function notesSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  return [sectionH("Generation Notes"), ...renderMixedContent(content.generationNotes)];
}

// ─── Template Guidance (when no lead data) ─────────────────────

function templateGuidanceSection(): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(sectionH("Capacity Model & Rollout Plan"));
  elements.push(bodyP(CAPACITY_MODEL_INTRO));
  elements.push(emptyPara());

  // Default capacity table for 2 accounts
  const capRows = DEFAULT_CAPACITY_MODEL.map(
    (row) =>
      new TableRow({
        children: [
          bCell(row.week, { w: 16 }),
          bCell(String(row.perAccount), { w: 16 }),
          bCell(String(row.total), { w: 20 }),
          bCell(String(row.cumulative), { w: 24 }),
          bCell(row.phase, { w: 24 }),
        ],
      })
  );
  elements.push(
    makeTable([16, 16, 20, 24, 24], ["", "Per Account", "x2 Accounts", "Cumulative Total", "Phase"], capRows)
  );
  elements.push(emptyPara());
  elements.push(
    bodyP(
      "Note: The table above assumes 2 sender accounts. Once lead lists are provided, this section will include specific lead tiering, weekly rollout plans, and statistical feasibility analysis tailored to the actual lead volumes.",
      { italics: true }
    )
  );

  return elements;
}

// ─── Main Builder ──────────────────────────────────────────────

function headerContent(companyName: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          tr("MVRX LABS", { bold: true, size: SZ.headerFooter, color: C.brand }),
          tr("    |    ", { size: SZ.headerFooter, color: C.gray }),
          tr(
            `${companyName} Outbound — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
            {
              size: SZ.headerFooter,
              color: C.gray,
            }
          ),
        ],
      }),
    ],
  });
}

function footerContent(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [tr("Confidential — MVRX Labs", { size: SZ.headerFooter, color: C.gray })],
      }),
    ],
  });
}

export async function buildOutboundSequenceDocx(content: OutboundSequenceContent): Promise<Buffer> {
  const cover = coverPage(content);
  const hasLeadData = !!content.leadListInventory?.length;

  const body: (Paragraph | Table)[] = [];

  // 1. Benchmarks
  body.push(...benchmarksSection(content));

  // 2. Positioning
  body.push(...positioningSection(content));

  // 3. Connection request strategy + proposed sequences overview
  body.push(...connectionRequestSection(content));
  body.push(emptyPara());
  body.push(...proposedSequencesOverview(content));

  // 4. Structural A/B tests
  body.push(...structuralTestsSection(content));

  // 5. Capacity model & rollout
  if (hasLeadData) {
    body.push(...capacityModelSection(content));
    body.push(...leadListInventorySection(content));
    body.push(...leadTieringSection(content));
    body.push(...weeklyRolloutSection(content));
  } else {
    body.push(...templateGuidanceSection());
  }

  // 6. Per-sequence sections
  for (let i = 0; i < content.sequences.length; i++) {
    body.push(...sequenceSection(content.sequences[i], i));
  }

  // 7. Statistical significance
  body.push(...statisticalSection(content));

  // 8. Appendix (if lead data)
  if (hasLeadData) {
    body.push(...appendixSection(content));
  }

  // 9. Generation notes
  if (content.generationNotes) {
    body.push(...notesSection(content));
  }

  // 10. Sign-off
  body.push(...signOff());

  const doc = new Document({
    numbering: numbering(),
    features: { updateFields: true },
    styles: {
      default: {
        heading1: {
          run: { font: FONT, size: SZ.sectionH, color: C.brand, bold: true },
          paragraph: { spacing: { before: 100, after: 200 } },
        },
        heading2: {
          run: { font: FONT, size: SZ.subH, color: C.dark, bold: true },
          paragraph: { spacing: { before: 300, after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: COVER_MARGIN, right: COVER_MARGIN, bottom: COVER_MARGIN, left: COVER_MARGIN },
          },
        },
        children: cover,
      },
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: BODY_MARGIN_TB,
              right: BODY_MARGIN_LR,
              bottom: BODY_MARGIN_TB,
              left: BODY_MARGIN_LR,
            },
          },
        },
        headers: { default: headerContent(content.companyName) },
        footers: { default: footerContent() },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
