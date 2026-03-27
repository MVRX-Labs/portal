import {
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
  convertInchesToTwip,
} from "docx";
import type { ContentBlock } from "../audit-schema";

export const FONT = "Arial";

export const C = {
  brand: "6C3AED",
  darkNavy: "1A1A2E",
  body: "2D2D44",
  meta: "8E8EA0",
  white: "FFFFFF",
  tableRowAlt: "F4F4F6",
  green: "2ECC71",
  orange: "F39C12",
  red: "DC2626",
  tableBorder: "D1D5DB",
} as const;

export const S = {
  brand: 24,
  docTitle: 44,
  name: 22,
  role: 22,
  meta: 18,
  sectionH: 28,
  subH: 24,
  body: 20,
  tableCell: 20,
  signoffBrand: 14,
  signoffTag: 14,
} as const;

export const PAGE_WIDTH = convertInchesToTwip(8.5);
export const PAGE_HEIGHT = convertInchesToTwip(11);
export const PAGE_MARGIN = convertInchesToTwip(1);
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
export const BULLET_REF = "audit-bullets";

const CELL_MARGINS = {
  top: 60,
  bottom: 60,
  left: 100,
  right: 100,
};

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};

export function tr(
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

export function textRuns(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string }
): TextRun[] {
  const lines = text.split("\n");
  return lines.map((line, i) => tr(line, { ...opts, break: i > 0 ? 1 : undefined }));
}

export function emptyPara(spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({ children: [], ...(spacing ? { spacing } : {}) });
}

export function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: "Heading1",
    spacing: { before: 300, after: 200 },
    children: [tr(text, { bold: true, size: S.sectionH, color: C.darkNavy })],
  });
}

export function subHeading(text: string): Paragraph {
  return new Paragraph({
    heading: "Heading2",
    spacing: { before: 240, after: 140 },
    children: [tr(text, { bold: true, size: S.subH, color: C.brand })],
  });
}

export function bodyPara(text: string, opts?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120, line: 264 },
    children: textRuns(text, { ...opts }),
  });
}

export function labeledPara(label: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 264 },
    children: [tr(label + " ", { bold: true }), ...textRuns(text)],
  });
}

export function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

export function scoreColor(score: number): string {
  if (score >= 7) return C.green;
  if (score >= 5) return C.orange;
  return C.red;
}

export function colWidth(pct: number): { size: number; type: typeof WidthType.DXA } {
  return { size: Math.round((CONTENT_WIDTH * pct) / 100), type: WidthType.DXA };
}

export function headerCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    shading: { fill: C.darkNavy, type: ShadingType.CLEAR, color: "auto" },
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
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

export function bodyCell(
  text: string,
  opts?: { bold?: boolean; color?: string; widthPct?: number; fill?: string }
): TableCell {
  return new TableCell({
    ...(opts?.fill ? { shading: { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
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

/** Headers matching these patterns get extra width (text-heavy columns). */
const WIDE_HEADERS = /commentary|assessment|why they matter|post concept|hook|tweet|thread/i;

function computeColumnWidths(headers: string[]): number[] {
  const wide = headers.map((h) => WIDE_HEADERS.test(h));
  const wideCount = wide.filter(Boolean).length;
  const narrowCount = headers.length - wideCount;
  if (wideCount === 0 || narrowCount === 0) return headers.map(() => 100 / headers.length);
  const narrowPct = Math.min(15, 60 / narrowCount);
  const widePct = (100 - narrowPct * narrowCount) / wideCount;
  return wide.map((w) => (w ? widePct : narrowPct));
}

export function dataTable(headers: string[], rows: string[][]): Table {
  const pcts = computeColumnWidths(headers);
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: pcts.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, pcts[i])) }),
      ...rows.map(
        (row, rowIndex) =>
          new TableRow({
            children: row.map((cell, i) =>
              bodyCell(cell, {
                widthPct: pcts[i],
                fill: rowIndex % 2 === 0 ? C.tableRowAlt : C.white,
              })
            ),
          })
      ),
    ],
  });
}

export function renderBlocks(blocks: ContentBlock[]): (Paragraph | Table)[] {
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
              spacing: { after: 80 },
              children,
            })
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

export function numbering() {
  return {
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
  };
}
