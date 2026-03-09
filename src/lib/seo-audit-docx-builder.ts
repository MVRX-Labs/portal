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
import type { SEOAuditContent } from "./seo-audit-schema";

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
  urlTitle: 28,
  meta: 20,
  sectionH: 28,
  subH: 22,
  body: 20,
  tableCell: 19,
  scoreValue: 36,
  signoffBrand: 28,
  signoffTag: 22,
  signoffSmall: 16,
} as const;
const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1200;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
const BULLET_REF = "seo-bullets";
const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};

function tr(text: string, opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? S.body,
    color: opts?.color ?? C.body,
    bold: opts?.bold,
    italics: opts?.italics,
  });
}

function emptyPara(): Paragraph {
  return new Paragraph({ children: [] });
}
function scoreColor(s: number): string {
  return s >= 80 ? C.green : s >= 60 ? C.orange : C.red;
}
function sevColor(s: string): string {
  return s === "fail" ? C.red : C.orange;
}
function effColor(e: string): string {
  return e === "low" ? C.green : e === "medium" ? C.orange : C.red;
}
function colW(pct: number) {
  return { size: Math.round((CONTENT_WIDTH * pct) / 100), type: WidthType.DXA };
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
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120 }, children: [tr(text, opts)] });
}
function bulletItem(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 60 },
    children: [tr(text)],
  });
}

function hCell(text: string, w?: number): TableCell {
  return new TableCell({
    shading: { fill: C.darkNavy, type: ShadingType.CLEAR, color: "auto" },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(w ? { width: colW(w) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: true, size: S.tableCell, color: C.white })],
      }),
    ],
  });
}
function bCell(text: string, opts?: { bold?: boolean; color?: string; w?: number; fill?: string }): TableCell {
  return new TableCell({
    ...(opts?.fill ? { shading: { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(opts?.w ? { width: colW(opts.w) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: opts?.bold, size: S.tableCell, color: opts?.color })],
      }),
    ],
  });
}

function makeTable(cols: number[], headers: string[], rowFn: (rowFill: (idx: number) => string) => TableRow[]): Table {
  const altFill = (idx: number) => (idx % 2 === 0 ? C.tableRowAlt : C.white);
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: headers.map((h, i) => hCell(h, cols[i])) }), ...rowFn(altFill)],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function coverPage(c: SEOAuditContent): Paragraph[] {
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
      children: [tr("Website SEO Audit", { size: S.docTitle, color: C.darkNavy })],
    }),
    emptyPara(),
    emptyPara(),
    new Paragraph({ children: [tr(c.websiteUrl, { bold: true, size: S.urlTitle, color: C.darkNavy })] }),
    emptyPara(),
    new Paragraph({
      children: [
        tr(`Score: ${c.overallScore.score}/100 (${c.overallScore.grade})`, {
          bold: true,
          size: S.scoreValue,
          color: scoreColor(c.overallScore.score),
        }),
      ],
    }),
    new Paragraph({ children: [tr(`Pages Audited: ${c.overallScore.pagesAudited}`, { size: S.meta, color: C.meta })] }),
    emptyPara(),
    emptyPara(),
    new Paragraph({ children: [tr(`Prepared: ${c.preparedDate}`, { size: S.meta, color: C.meta })] }),
    new Paragraph({ children: [tr("Classification: Confidential", { size: S.meta, color: C.meta })] }),
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
    new Paragraph({ children: [tr("Attention, Measured.", { size: S.signoffTag, color: C.meta })] }),
    emptyPara(),
    new Paragraph({ children: [tr("For implementation support and growth programmes:", { size: S.body })] }),
    new Paragraph({
      children: [
        tr("tidycal.com/mvrxlabs/introductory-meeting-mvrxlabs", { bold: true, size: S.body, color: C.brandBlue }),
      ],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("This report was generated by MVRX Labs\u2019 SEO Audit Platform.", { size: S.signoffSmall, color: C.meta }),
      ],
    }),
  ];
}

export async function buildSeoAuditDocx(content: SEOAuditContent): Promise<Buffer> {
  const ch: (Paragraph | Table)[] = [];
  ch.push(...coverPage(content));

  // 1. Executive Summary
  ch.push(pageBreak(), sectionHeading("1. Executive Summary"), bodyPara(content.overallScore.summary));

  // 2. Category Breakdown
  ch.push(pageBreak(), sectionHeading("2. Category Breakdown"));
  ch.push(
    makeTable(
      [22, 10, 10, 10, 10, 10, 28],
      ["Category", "Score", "Weight", "Pass", "Warn", "Fail", "Top Issue"],
      (rowFill) =>
        content.categoryBreakdown.map(
          (c, i) =>
            new TableRow({
              children: [
                bCell(c.category, { bold: true, fill: rowFill(i) }),
                bCell(`${c.score}`, { color: scoreColor(c.score), fill: rowFill(i) }),
                bCell(c.weight, { fill: rowFill(i) }),
                bCell(`${c.passCount}`, { color: C.green, fill: rowFill(i) }),
                bCell(`${c.warnCount}`, { color: C.orange, fill: rowFill(i) }),
                bCell(`${c.failCount}`, { color: C.red, fill: rowFill(i) }),
                bCell(c.topIssue || "\u2014", { fill: rowFill(i) }),
              ],
            })
        )
    )
  );

  // 3. Critical Issues
  ch.push(pageBreak(), sectionHeading("3. Critical Issues"));
  if (content.criticalIssues.length > 0) {
    ch.push(
      makeTable([10, 15, 20, 55], ["Severity", "Category", "Rule", "Fix Recommendation"], (rowFill) =>
        content.criticalIssues.map(
          (issue, idx) =>
            new TableRow({
              children: [
                bCell(issue.severity.toUpperCase(), {
                  bold: true,
                  color: sevColor(issue.severity),
                  fill: rowFill(idx),
                }),
                bCell(issue.category, { bold: true, fill: rowFill(idx) }),
                bCell(issue.rule, { fill: rowFill(idx) }),
                bCell(issue.fixRecommendation, { fill: rowFill(idx) }),
              ],
            })
        )
      )
    );
    ch.push(emptyPara());
    for (const issue of content.criticalIssues) {
      if (issue.affectedUrls.length > 0) {
        ch.push(subHeading(`${issue.rule} \u2014 Affected URLs`));
        for (const url of issue.affectedUrls.slice(0, 10)) ch.push(bulletItem(url));
        if (issue.affectedUrls.length > 10)
          ch.push(bodyPara(`...and ${issue.affectedUrls.length - 10} more`, { italics: true }));
      }
    }
  } else {
    ch.push(bodyPara("No critical issues found \u2014 excellent work!"));
  }

  // 4. Strengths
  ch.push(pageBreak(), sectionHeading("4. Strengths & Wins"));
  for (const win of content.strengthsAndWins) ch.push(bulletItem(win));

  // 5. Action Plan
  ch.push(pageBreak(), sectionHeading("5. Prioritised Action Plan"));
  ch.push(
    makeTable([8, 15, 37, 25, 15], ["#", "Category", "Action", "Impact", "Effort"], (rowFill) =>
      content.prioritizedActionPlan.map(
        (a, idx) =>
          new TableRow({
            children: [
              bCell(`${a.priority}`, { bold: true, fill: rowFill(idx) }),
              bCell(a.category, { bold: true, fill: rowFill(idx) }),
              bCell(a.action, { fill: rowFill(idx) }),
              bCell(a.expectedImpact, { fill: rowFill(idx) }),
              bCell(a.effort.toUpperCase(), { bold: true, color: effColor(a.effort), fill: rowFill(idx) }),
            ],
          })
      )
    )
  );

  // 6. Next Steps
  ch.push(pageBreak(), sectionHeading("6. Next Steps"));
  ch.push(subHeading("This Week"));
  for (const a of content.nextSteps.immediateActions) ch.push(bulletItem(a));
  ch.push(subHeading("This Month"));
  for (const a of content.nextSteps.shortTermActions) ch.push(bulletItem(a));
  ch.push(subHeading("2-3 Months"));
  for (const a of content.nextSteps.longTermActions) ch.push(bulletItem(a));
  ch.push(
    emptyPara(),
    bodyPara(content.nextSteps.ctaParagraph),
    bodyPara(content.nextSteps.mvrxValueProp, { italics: true })
  );
  ch.push(...signOff());

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
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
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
            margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
          },
        },
        children: ch,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
