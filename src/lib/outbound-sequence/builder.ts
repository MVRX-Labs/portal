import { Document, Packer, Paragraph, Table, TableRow, Header, Footer, AlignmentType } from "docx";
import type { OutboundSequenceContent, Sequence, SequenceStep } from "./schema";
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
      children: [tr("LinkedIn Outbound Sequences", { bold: true, size: SZ.title, color: C.dark })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 400 },
      children: [tr("HeyReach Campaign Copy — A/B Variants", { size: SZ.subtitle, color: C.gray })],
    }),
    emptyPara(),
    bodyP(`Prepared for: ${content.senderName} (${content.senderOrg})`),
    bodyP(`Target ICP: ${content.targetIcp}`),
    bodyP(`Date: ${content.preparedDate}`),
    emptyPara(),
    emptyPara(),
    bodyP(`3 sequence structures × 2 A/B variants = 6 testable sequences`),
    emptyPara(),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [tr("Confidential — MVRX Labs", { size: SZ.dataSrc, color: C.gray })],
    }),
  ];
}

// ─── Variant Strategy Section ──────────────────────────────────

function variantStrategySection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  const vs = content.variantStrategy;
  return [
    sectionH("A/B Testing Strategy"),
    bodyP(
      "Each sequence has two content variants that test a specific hypothesis. " +
        "Run both variants simultaneously in HeyReach to determine which approach resonates with this ICP."
    ),
    emptyPara(),
    subH(`Variant A: ${vs.variantALabel}`),
    bodyP(vs.variantADescription),
    emptyPara(),
    subH(`Variant B: ${vs.variantBLabel}`),
    bodyP(vs.variantBDescription),
  ];
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

function messageBlock(label: string, text: string | null, chars?: number): (Paragraph | Table)[] {
  if (text === null)
    return [bodyP(`${label}: [Engage with their content — like or comment on a recent post]`, { italics: true })];

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

function sequenceSection(seq: Sequence, seqIndex: number): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  const seqLabel = seqIndex === 0 ? "A" : seqIndex === 1 ? "B" : "C";
  elements.push(sectionH(`Sequence ${seqLabel}: ${seq.name}`));
  elements.push(bodyP(seq.description));
  elements.push(bodyP(`Total steps: ${seq.totalSteps} | Duration: ${seq.totalDays} days`));
  elements.push(emptyPara());

  // Overview table
  elements.push(subH("Sequence Structure"));
  elements.push(sequenceOverviewTable(seq));
  elements.push(emptyPara());

  // Step-by-step content
  elements.push(subH("Step-by-Step Content"));

  for (const step of seq.steps) {
    elements.push(emptyPara());
    elements.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          tr(`Step ${step.stepNumber}: ${stepTypeLabel(step)}`, { bold: true, size: SZ.subH, color: C.dark }),
          tr(` — ${step.intent}`, { size: SZ.body, color: C.gray }),
        ],
      })
    );

    if (step.type === "engage_post") {
      elements.push(bodyP("[Like or comment on their recent post — no direct message]", { italics: true }));
    } else {
      elements.push(...messageBlock("Variant A", step.variantA, step.variantAChars));
      elements.push(...messageBlock("Variant B", step.variantB, step.variantBChars));
    }
  }

  return elements;
}

// ─── Generation Notes ──────────────────────────────────────────

function notesSection(content: OutboundSequenceContent): (Paragraph | Table)[] {
  return [sectionH("Generation Notes"), bodyP(content.generationNotes)];
}

// ─── Main Builder ──────────────────────────────────────────────

function headerContent(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          tr("MVRX LABS", { bold: true, size: SZ.headerFooter, color: C.brand }),
          tr("    |    ", { size: SZ.headerFooter, color: C.gray }),
          tr(
            `LinkedIn Outbound Sequences — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
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

  const body: (Paragraph | Table)[] = [];

  // A/B strategy overview
  body.push(...variantStrategySection(content));

  // Each sequence
  for (let i = 0; i < content.sequences.length; i++) {
    body.push(...sequenceSection(content.sequences[i], i));
  }

  // Notes
  if (content.generationNotes) {
    body.push(...notesSection(content));
  }

  // Sign-off
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
        headers: { default: headerContent() },
        footers: { default: footerContent() },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
