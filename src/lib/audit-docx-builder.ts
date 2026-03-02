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
} from "docx";
import type { LinkedInAuditContent, ContentBlock } from "./audit-schema";

const FONT = "Arial";

const C = {
  brandBlue: "4A6CF7",
  darkNavy: "1A1A2E",
  body: "444444",
  meta: "888888",
  white: "FFFFFF",
  tableRowAlt: "F3F5F8",
  green: "2ECC71",
  orange: "F39C12",
  red: "E74C3C",
  tableBorder: "DDDDDD",
} as const;

/** Half-point sizes (multiply pt x 2) */
const S = {
  brand: 40,
  docTitle: 32,
  name: 36,
  role: 24,
  url: 20,
  meta: 20,
  sectionH: 28,
  subH: 22,
  body: 20,
  tableCell: 19,
  scoreLabel: 26,
  scoreValue: 28,
  signoffBrand: 28,
  signoffTag: 22,
  signoffSmall: 16,
} as const;

const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1200;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

const BULLET_REF = "audit-bullets";

function tr(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string; break?: number },
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
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string },
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

function overallScoreColor(score: number): string {
  if (score >= 70) return C.green;
  if (score >= 40) return C.orange;
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
    children: [
      tr(label + " ", { bold: true }),
      ...textRuns(text),
    ],
  });
}

function colWidth(pct: number): { size: number; type: typeof WidthType.DXA } {
  return { size: Math.round(CONTENT_WIDTH * pct / 100), type: WidthType.DXA };
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

function bodyCell(text: string, opts?: { bold?: boolean; color?: string; widthPct?: number; fill?: string }): TableCell {
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

function overallScoreTable(score: number): Table {
  const cols = [70, 30];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round(CONTENT_WIDTH * p / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: colWidth(70),
            borders: CELL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [tr("Overall Audit Score", { bold: true, size: S.scoreLabel, color: C.darkNavy })],
              }),
            ],
          }),
          new TableCell({
            width: colWidth(30),
            borders: CELL_BORDERS,
            shading: { fill: overallScoreColor(score), type: ShadingType.CLEAR, color: "auto" },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 80 },
                children: [tr(`${score} / 100`, { bold: true, size: S.scoreValue, color: C.white })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function scorecardTable(entries: LinkedInAuditContent["scorecard"]): Table {
  const cols = [25, 15, 60];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round(CONTENT_WIDTH * p / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Category", 25),
          headerCell("Score", 15),
          headerCell("Assessment", 60),
        ],
      }),
      ...entries.map((e, rowIndex) => {
        const sc = scoreColor(e.score);
        const rowFill = rowIndex % 2 === 0 ? C.tableRowAlt : C.white;
        return new TableRow({
          children: [
            bodyCell(e.category, { bold: true, fill: rowFill }),
            bodyCell(`${e.score}/10`, { color: sc, fill: rowFill }),
            bodyCell(e.assessment, { fill: rowFill }),
          ],
        });
      }),
    ],
  });
}

function dataTable(headers: string[], rows: string[][]): Table {
  const colPct = 100 / headers.length;
  const colTwips = Math.round(CONTENT_WIDTH / headers.length);
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: headers.map(() => colTwips),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: headers.map((h) => headerCell(h, colPct)) }),
      ...rows.map(
        (row, rowIndex) => new TableRow({
          children: row.map((cell) => bodyCell(cell, {
            widthPct: colPct,
            fill: rowIndex % 2 === 0 ? C.tableRowAlt : C.white,
          })),
        }),
      ),
    ],
  });
}

function renderBlocks(blocks: ContentBlock[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        out.push(bodyPara(b.text));
        break;

      case "labeled":
        out.push(labeledPara(b.label, b.text));
        break;

      case "bulletList":
        for (const item of b.items) {
          const children: TextRun[] = [];
          if (item.label) {
            children.push(tr(item.label + " ", { bold: true }));
            children.push(...textRuns(item.text));
          } else {
            children.push(...textRuns(item.text));
          }
          out.push(
            new Paragraph({
              numbering: { reference: BULLET_REF, level: 0 },
              spacing: { after: 60 },
              children,
            }),
          );
        }
        out.push(emptyPara());
        break;

      case "numberedList":
        for (let i = 0; i < b.items.length; i++) {
          out.push(bodyPara(`${i + 1}. ${b.items[i]}`, { bold: true }));
        }
        out.push(emptyPara());
        break;

      case "table":
        out.push(dataTable(b.headers, b.rows));
        out.push(emptyPara());
        break;
    }
  }

  return out;
}

function coverPage(c: LinkedInAuditContent): Paragraph[] {
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
      children: [tr("LinkedIn Profile Audit", { size: S.docTitle, color: C.darkNavy })],
    }),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(c.personName, { bold: true, size: S.name, color: C.darkNavy })],
    }),
    new Paragraph({
      children: [tr(c.personTitle, { size: S.role, color: C.body })],
    }),
    new Paragraph({
      children: [tr(`linkedin.com/in/${c.linkedinSlug}`, { size: S.url, color: C.brandBlue })],
    }),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(`Prepared: ${c.preparedDate}`, { size: S.meta, color: C.meta })],
    }),
    new Paragraph({
      children: [tr("Classification: Confidential", { size: S.meta, color: C.meta })],
    }),
  ];
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
      children: [tr("For implementation support and LinkedIn growth programmes:", { size: S.body })],
    }),
    new Paragraph({
      children: [tr("tidycal.com/mvrxlabs/introductory-meeting-mvrxlabs", { bold: true, size: S.body, color: C.brandBlue })],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr(
          "This report was generated by MVRX Labs\u2019 LinkedIn Intelligence Platform.",
          { size: S.signoffSmall, color: C.meta },
        ),
      ],
    }),
  ];
}

export async function buildAuditDocx(content: LinkedInAuditContent): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(...coverPage(content));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("Executive Summary"));
  for (const para of content.executiveSummary) {
    children.push(bodyPara(para));
  }

  children.push(emptyPara());
  children.push(overallScoreTable(content.overallScore));
  children.push(emptyPara());

  children.push(bodyPara(content.verdict, { italics: true }));
  children.push(emptyPara());

  children.push(sectionHeading("Audit Scorecard"));
  children.push(scorecardTable(content.scorecard));
  children.push(emptyPara());

  content.sections.forEach((section, si) => {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(sectionHeading(`${si + 1}. ${section.title}`));

    if (section.subsections) {
      section.subsections.forEach((sub, subi) => {
        children.push(subHeading(`${si + 1}.${subi + 1} ${sub.title}`));
        children.push(...renderBlocks(sub.content));
      });
    }

    if (section.content) {
      children.push(...renderBlocks(section.content));
    }
  });

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
