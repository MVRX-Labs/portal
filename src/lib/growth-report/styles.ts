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
  ExternalHyperlink,
} from "docx";

export const FONT = "Arial";
export const C = {
  brand: "6C3AED",
  dark: "0D0D0D",
  body: "444444",
  gray: "6B7280",
  white: "FFFFFF",
  green: "2ECC71",
  orange: "F39C12",
  red: "E74C3C",
  tableBorder: "DDDDDD",
  tableRowAlt: "F3F5F8",
  statBg: "F9FAFB",
} as const;

export const SZ = {
  brand: 28,
  title: 48,
  subtitle: 36,
  metaMd: 22,
  metaSm: 18,
  dataSrc: 16,
  sectionH: 28,
  subH: 22,
  body: 20,
  cell: 19,
  statLabel: 16,
  statValue: 28,
  signBrand: 28,
  signTag: 22,
  signSm: 16,
} as const;

export const PAGE_WIDTH = 11906;
export const PAGE_MARGIN = 1200;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
export const BULLET_REF = "growth-bullets";

const B = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};
const NO_B = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

export function tr(text: string, o?: { bold?: boolean; italics?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: o?.size ?? SZ.body,
    color: o?.color ?? C.body,
    bold: o?.bold,
    italics: o?.italics,
  });
}

export function emptyPara(): Paragraph {
  return new Paragraph({ children: [] });
}

export function sectionH(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 120 },
    children: [tr(text, { bold: true, size: SZ.sectionH, color: C.dark })],
  });
}
export function subH(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    children: [tr(text, { bold: true, size: SZ.subH, color: C.brand })],
  });
}
export function bodyP(text: string, o?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120 }, children: [tr(text, o)] });
}
export function dataSourceP(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [tr(`Data source: ${text}`, { size: SZ.dataSrc, color: C.gray, italics: true })],
  });
}
export function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 60 },
    children: [tr(text)],
  });
}
export function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

export function scoreColor(s: number): string {
  return s >= 80 ? C.green : s >= 60 ? C.orange : C.red;
}
function colW(pct: number): { size: number; type: typeof WidthType.DXA } {
  return { size: Math.round((CONTENT_WIDTH * pct) / 100), type: WidthType.DXA };
}

export function hCell(text: string, w?: number): TableCell {
  return new TableCell({
    shading: { fill: C.dark, type: ShadingType.CLEAR, color: "auto" },
    borders: B,
    verticalAlign: VerticalAlign.CENTER,
    ...(w ? { width: colW(w) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: true, size: SZ.cell, color: C.white })],
      }),
    ],
  });
}

export function bCell(text: string, o?: { bold?: boolean; color?: string; w?: number; fill?: string }): TableCell {
  return new TableCell({
    ...(o?.fill ? { shading: { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    borders: B,
    verticalAlign: VerticalAlign.CENTER,
    ...(o?.w ? { width: colW(o.w) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: o?.bold, size: SZ.cell, color: o?.color })],
      }),
    ],
  });
}

export function makeTable(cols: number[], headers: string[], rows: TableRow[]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: headers.map((h, i) => hCell(h, cols[i])) }), ...rows],
  });
}

export function altFill(idx: number): string {
  return idx % 2 === 0 ? C.tableRowAlt : C.white;
}

export function statCard(label: string, value: string): TableCell {
  return new TableCell({
    shading: { fill: C.statBg, type: ShadingType.CLEAR, color: "auto" },
    borders: NO_B,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 20 },
        children: [tr(label, { size: SZ.statLabel, color: C.gray, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [tr(value, { size: SZ.statValue, color: C.dark, bold: true })],
      }),
    ],
  });
}

export function statRow(cards: [string, string][]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cards.map(() => Math.round(CONTENT_WIDTH / cards.length)),
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: cards.map(([l, v]) => statCard(l, v)) })],
  });
}

export function signOff(): (Paragraph | Table)[] {
  return [
    emptyPara(),
    emptyPara(),
    new Paragraph({
      spacing: { before: 600 },
      children: [tr("MVRX Labs", { bold: true, size: SZ.signBrand, color: C.brand })],
    }),
    new Paragraph({ children: [tr("Attention, Measured.", { size: SZ.signTag, color: C.gray })] }),
    emptyPara(),
    bodyP("For implementation support and growth programmes:"),
    new Paragraph({
      children: [
        new ExternalHyperlink({
          link: "https://cal.com/romil-depala-sabsp0/30min",
          children: [tr("Book a Call", { bold: true, size: SZ.body, color: C.brand })],
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({ children: [tr("This report was generated by MVRX Labs.", { size: SZ.signSm, color: C.gray })] }),
  ];
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
