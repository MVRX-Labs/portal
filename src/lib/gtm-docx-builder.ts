import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ShadingType,
  BorderStyle,
  PageBreak,
  LevelFormat,
  VerticalAlign,
  TableLayoutType,
  ExternalHyperlink,
} from "docx";
import type { GTMStrategyContent } from "./gtm-schema";

const FONT = "Arial";

const C = {
  brandBlue: "4A6CF7",
  darkNavy: "1A1A2E",
  body: "444444",
  meta: "888888",
  white: "FFFFFF",
  green: "2ECC71",
  orange: "F39C12",
  red: "E74C3C",
  tableBorder: "DDDDDD",
  tableRowAlt: "F3F5F8",
} as const;

const S = {
  brand: 40,
  docTitle: 32,
  coverSubtitle: 26,
  companyName: 36,
  meta: 20,
  sectionH: 28,
  subH: 22,
  body: 20,
  tableCell: 19,
  scoreLabel: 26,
  scoreValue: 28,
  tocItem: 22,
  channelHeading: 26,
  signoffBrand: 28,
  signoffTag: 22,
  signoffSmall: 16,
} as const;

const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1200;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

const BULLET_REF = "gtm-bullets";

function tr(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string; break?: number }
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? S.body,
    color: opts?.color ?? C.body,
    bold: opts?.bold,
    italics: opts?.italics,
    break: opts?.break,
  });
}

function textRuns(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string }
): TextRun[] {
  const lines = text.split("\n");
  const runs: TextRun[] = [];
  for (let i = 0; i < lines.length; i++) {
    runs.push(tr(lines[i], { ...opts, break: i > 0 ? 1 : undefined }));
  }
  return runs;
}

function emptyPara(): Paragraph {
  return new Paragraph({ children: [] });
}

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};

function scoreColor(score: number): string {
  if (score >= 7) return C.green;
  if (score >= 5) return C.orange;
  return C.red;
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 120 },
    children: [tr(text, { bold: true, size: S.sectionH, color: C.darkNavy })],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    children: [tr(text, { bold: true, size: S.subH, color: C.brandBlue })],
  });
}

function bodyPara(text: string, opts?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120 },
    children: textRuns(text, { ...opts }),
  });
}

function labeledPara(label: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [tr(label + " ", { bold: true }), ...textRuns(text)],
  });
}

function bulletItem(text: string, opts?: { bold?: boolean }): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 60 },
    children: [tr(text, { bold: opts?.bold })],
  });
}

function numberedItem(index: number, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [tr(`${index}. ${text}`, { bold: true })],
  });
}

function colWidth(pct: number): { size: number; type: typeof WidthType.DXA } {
  return { size: Math.round((CONTENT_WIDTH * pct) / 100), type: WidthType.DXA };
}

function headerCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    shading: { fill: C.darkNavy, type: ShadingType.CLEAR, color: "auto" },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(widthPct ? { width: colWidth(widthPct) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: true, size: S.tableCell, color: C.white })],
      }),
    ],
  });
}

function bodyCell(
  text: string,
  opts?: { bold?: boolean; color?: string; widthPct?: number; fill?: string }
): TableCell {
  return new TableCell({
    ...(opts?.fill ? { shading: { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(opts?.widthPct ? { width: colWidth(opts.widthPct) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: opts?.bold, size: S.tableCell, color: opts?.color })],
      }),
    ],
  });
}

function dataTable(headers: string[], rows: string[][], colWidths?: number[]): Table {
  const colPct = 100 / headers.length;
  const widths = colWidths || headers.map(() => colPct);
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, widths[i])) }),
      ...rows.map((row, rowIdx) => {
        const fill = rowIdx % 2 === 0 ? C.tableRowAlt : C.white;
        return new TableRow({
          children: row.map((cell, i) => bodyCell(cell, { widthPct: widths[i], fill })),
        });
      }),
    ],
  });
}

function coverPage(c: GTMStrategyContent): Paragraph[] {
  return [
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [tr("MVRX LABS", { bold: true, size: S.brand, color: C.brandBlue })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [tr("Go-To-Market Launch Strategy", { size: S.docTitle, color: C.darkNavy })],
    }),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(c.companyName, { bold: true, size: S.companyName, color: C.darkNavy })],
    }),
    new Paragraph({
      children: [tr(c.industry, { size: S.coverSubtitle, color: C.body })],
    }),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(`Prepared for: ${c.preparedFor}`, { size: S.meta, color: C.meta })],
    }),
    new Paragraph({
      children: [tr(`Prepared: ${c.preparedDate}`, { size: S.meta, color: C.meta })],
    }),
    new Paragraph({
      children: [tr("Classification: Confidential", { size: S.meta, color: C.meta })],
    }),
  ];
}

function tableOfContents(): (Paragraph | Table)[] {
  const sections = [
    "1. Situation Overview",
    "2. Digital Presence Audit",
    "3. Competitive Landscape",
    "4. Channel Strategy Overview",
    "5. Channel Detail: Primary",
    "6. Channel Detail: Secondary",
    "7. Channel Detail: Tertiary",
    "8. 90-Day Execution Roadmap",
    "9. Success Metrics & Growth Targets",
    "10. Next Steps",
  ];

  return [
    sectionHeading("Table of Contents"),
    emptyPara(),
    ...sections.map(
      (s) =>
        new Paragraph({
          spacing: { after: 100 },
          children: [tr(s, { size: S.tocItem, color: C.darkNavy })],
        })
    ),
  ];
}

function situationOverviewSection(so: GTMStrategyContent["situationOverview"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("1. Situation Overview"));
  out.push(bodyPara(so.summary));
  out.push(emptyPara());

  out.push(subHeading("What's Working"));
  for (const item of so.whatsWorking) {
    out.push(bulletItem(item));
  }
  out.push(emptyPara());

  out.push(subHeading("The Challenge"));
  for (const item of so.theChallenge) {
    out.push(bulletItem(item));
  }
  out.push(emptyPara());

  out.push(labeledPara("Key Observation:", so.keyObservation));
  out.push(emptyPara());

  out.push(subHeading("Strategic Priorities"));
  for (let i = 0; i < so.strategicPriorities.length; i++) {
    out.push(numberedItem(i + 1, so.strategicPriorities[i]));
  }
  out.push(emptyPara());

  return out;
}

function presenceAuditSection(pa: GTMStrategyContent["presenceAudit"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("2. Digital Presence Audit"));

  const scoreRows = [
    ["Website", `${pa.websiteScore}/10`, pa.websiteAssessment],
    ["SEO", `${pa.seoScore}/10`, pa.seoAssessment],
    ["Social Media", `${pa.socialMediaScore}/10`, pa.socialMediaAssessment],
  ];

  const cols = [25, 15, 60];
  out.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [headerCell("Area", 25), headerCell("Score", 15), headerCell("Assessment", 60)],
        }),
        ...scoreRows.map((row, rowIdx) => {
          const score = parseInt(row[1]);
          const fill = rowIdx % 2 === 0 ? C.tableRowAlt : C.white;
          return new TableRow({
            children: [
              bodyCell(row[0], { bold: true, widthPct: 25, fill }),
              bodyCell(row[1], { color: scoreColor(score), widthPct: 15, fill }),
              bodyCell(row[2], { widthPct: 60, fill }),
            ],
          });
        }),
      ],
    })
  );

  out.push(emptyPara());
  out.push(labeledPara("Overall Assessment:", pa.overallAssessment));
  out.push(emptyPara());

  return out;
}

function competitiveLandscapeSection(cl: GTMStrategyContent["competitiveLandscape"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("3. Competitive Landscape"));

  for (const comp of cl.competitors) {
    out.push(subHeading(comp.name));
    out.push(labeledPara("Positioning:", comp.positioning));

    out.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [tr("Strengths:", { bold: true, color: C.green })],
      })
    );
    for (const s of comp.strengths) {
      out.push(bulletItem(s));
    }

    out.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [tr("Weaknesses:", { bold: true, color: C.red })],
      })
    );
    for (const w of comp.weaknesses) {
      out.push(bulletItem(w));
    }

    out.push(bodyPara(comp.keyTakeaway, { italics: true }));
    out.push(emptyPara());
  }

  out.push(labeledPara("Strategic Position:", cl.strategicPosition));
  out.push(emptyPara());

  out.push(subHeading("Positioning Takeaways"));
  for (const t of cl.positioningTakeaways) {
    out.push(bulletItem(t));
  }
  out.push(emptyPara());

  return out;
}

function channelOverviewSection(cs: GTMStrategyContent["channelStrategyOverview"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("4. Channel Strategy Overview"));

  const cols = [30, 15, 55];
  out.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [headerCell("Channel", 30), headerCell("Fit Score", 15), headerCell("Rationale", 55)],
        }),
        ...cs.recommendedChannels.map((ch, rowIdx) => {
          const fill = rowIdx % 2 === 0 ? C.tableRowAlt : C.white;
          return new TableRow({
            children: [
              bodyCell(ch.name, { bold: true, widthPct: 30, fill }),
              bodyCell(`${ch.fitScore}/10`, { color: scoreColor(ch.fitScore), widthPct: 15, fill }),
              bodyCell(ch.rationale, { widthPct: 55, fill }),
            ],
          });
        }),
      ],
    })
  );

  out.push(emptyPara());

  out.push(subHeading("Why Not Other Channels?"));
  for (const reason of cs.whyNotOtherChannels) {
    out.push(bulletItem(reason));
  }
  out.push(emptyPara());

  out.push(labeledPara("How Channels Work Together:", cs.howChannelsWorkTogether));
  out.push(emptyPara());

  return out;
}

function channelDetailSection(
  cd: GTMStrategyContent["channelDetails"][number],
  sectionNum: number
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(sectionHeading(`${sectionNum}. Channel Detail: ${cd.channelName}`));

  out.push(
    dataTable(
      ["Investment", "Time to Results", "Key Metric"],
      [[cd.investment, cd.timeToResults, cd.keyMetric]],
      [33, 33, 34]
    )
  );
  out.push(emptyPara());

  out.push(labeledPara("Strategic Rationale:", cd.strategicRationale));
  out.push(emptyPara());

  out.push(subHeading("Key Tactics"));
  for (const tactic of cd.keyTactics) {
    out.push(bulletItem(tactic));
  }
  out.push(emptyPara());

  out.push(subHeading("12-Week Plan"));
  out.push(
    dataTable(
      ["Week", "Actions"],
      cd.twelveWeekPlan.map((wp) => [wp.week, wp.actions.join("; ")]),
      [20, 80]
    )
  );
  out.push(emptyPara());

  return out;
}

function executionRoadmapSection(er: GTMStrategyContent["executionRoadmap"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(sectionHeading("8. 90-Day Execution Roadmap"));

  for (const month of er.months) {
    out.push(subHeading(month.month));
    out.push(bodyPara(month.theme, { italics: true }));

    for (const action of month.actions) {
      out.push(bulletItem(action));
    }
    out.push(emptyPara());

    out.push(labeledPara("Checkpoint:", month.checkpoint));
    out.push(emptyPara());
  }

  return out;
}

function successMetricsSection(sm: GTMStrategyContent["successMetrics"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("9. Success Metrics & Growth Targets"));

  out.push(
    dataTable(
      ["Metric", "Current", "Day 30", "Day 60", "Day 90"],
      sm.growthTargets.map((gt) => [gt.metric, gt.current, gt.day30, gt.day60, gt.day90]),
      [28, 18, 18, 18, 18]
    )
  );
  out.push(emptyPara());

  out.push(labeledPara("Tracking Notes:", sm.trackingNotes));
  out.push(emptyPara());

  return out;
}

function nextStepsSection(ns: GTMStrategyContent["nextSteps"]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(sectionHeading("10. Next Steps"));

  out.push(subHeading("Immediate Actions"));
  for (let i = 0; i < ns.immediateActions.length; i++) {
    out.push(numberedItem(i + 1, ns.immediateActions[i]));
  }
  out.push(emptyPara());

  out.push(bodyPara(ns.ctaParagraph));
  out.push(emptyPara());

  out.push(bodyPara(ns.mvrxValueProp, { italics: true }));
  out.push(emptyPara());

  return out;
}

function signOff(): Paragraph[] {
  return [
    emptyPara(),
    emptyPara(),
    new Paragraph({
      spacing: { before: 600 },
      children: [tr("MVRX Labs", { bold: true, size: S.signoffBrand, color: C.brandBlue })],
    }),
    new Paragraph({
      children: [tr("Attention, Measured.", { size: S.signoffTag, color: C.meta })],
    }),
    emptyPara(),
    new Paragraph({
      children: [tr("For implementation support and go-to-market programmes:", { size: S.body })],
    }),
    new Paragraph({
      children: [
        new ExternalHyperlink({
          link: "https://cal.com/romil-depala-sabsp0/30min",
          children: [tr("Book a Call", { bold: true, size: S.body, color: C.brandBlue })],
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("This report was generated by MVRX Labs\u2019 GTM Intelligence Platform.", {
          size: S.signoffSmall,
          color: C.meta,
        }),
      ],
    }),
  ];
}

export async function buildGtmDocx(content: GTMStrategyContent): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(...coverPage(content));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(...tableOfContents());

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(...situationOverviewSection(content.situationOverview));

  children.push(...presenceAuditSection(content.presenceAudit));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(...competitiveLandscapeSection(content.competitiveLandscape));

  children.push(...channelOverviewSection(content.channelStrategyOverview));

  const channelDetails = content.channelDetails.slice(0, 3);
  for (let i = 0; i < channelDetails.length; i++) {
    children.push(...channelDetailSection(channelDetails[i], 5 + i));
  }

  children.push(...executionRoadmapSection(content.executionRoadmap));

  children.push(...successMetricsSection(content.successMetrics));

  children.push(...nextStepsSection(content.nextSteps));

  children.push(...signOff());

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
