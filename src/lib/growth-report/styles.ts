import {
  Paragraph,
  TextRun,
  ImageRun,
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
  HeadingLevel,
} from "docx";
import type { MetricStatus } from "./schema";

export const FONT = "Arial";
export const C = {
  brand: "6C3AED",
  dark: "0D0D0D",
  body: "0D0D0D",
  gray: "6B7280",
  white: "FFFFFF",
  green: "16A34A",
  orange: "D97706",
  red: "DC2626",
  tableBorder: "E5E7EB",
  // Semantic stat card backgrounds
  greenBg: "F0FDF4",
  amberBg: "FFFBEB",
  redBg: "FEF2F2",
  purpleBg: "F3F0FF",
} as const;

export const SZ = {
  brand: 28, // 14pt
  title: 48, // 24pt
  subtitle: 36, // 18pt
  metaMd: 22, // 11pt
  metaSm: 18, // 9pt
  dataSrc: 16, // 8pt
  sectionH: 40, // 20pt
  subH: 28, // 14pt
  body: 16, // 8pt
  cell: 16, // 8pt
  statLabel: 12, // 6pt
  statValue: 32, // 16pt
  headerFooter: 14, // 7pt
  signBrand: 28,
  signTag: 22,
  signSm: 16,
} as const;

// US Letter page dimensions (DXA)
export const PAGE_WIDTH = 12240; // 8.5"
export const PAGE_HEIGHT = 15840; // 11"

// Cover page margins (1" all sides)
export const COVER_MARGIN = 1440;

// Body section margins
export const BODY_MARGIN_TB = 1200; // ~0.83"
export const BODY_MARGIN_LR = 1100; // ~0.76"

// Content width for body section tables
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * BODY_MARGIN_LR;

export const BULLET_REF = "growth-bullets";

const B = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
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

/** H1 — purple 20pt bold, page break before (enables TOC) */
export function sectionH(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 100, after: 200 },
    children: [tr(text, { bold: true, size: SZ.sectionH, color: C.brand })],
  });
}

/** H2 — dark 14pt bold */
export function subH(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [tr(text, { bold: true, size: SZ.subH, color: C.dark })],
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

/** Bullet with bold lead-in: splits on first ": " to bold the prefix */
export function bullet(text: string): Paragraph {
  const sepIdx = text.indexOf(": ");
  const children =
    sepIdx > 0 && sepIdx < 80
      ? [tr(text.slice(0, sepIdx + 1), { bold: true }), tr(text.slice(sepIdx + 1))]
      : [tr(text)];

  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 60 },
    children,
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

/** Map metric status to card background + text colors */
const STATUS_COLORS: Record<MetricStatus, { bg: string; text: string }> = {
  good: { bg: C.greenBg, text: C.green },
  warning: { bg: C.amberBg, text: C.orange },
  bad: { bg: C.redBg, text: C.red },
  info: { bg: C.purpleBg, text: C.brand },
};

export function statCard(label: string, value: string, status: MetricStatus = "info"): TableCell {
  const colors = STATUS_COLORS[status];
  return new TableCell({
    shading: { fill: colors.bg, type: ShadingType.CLEAR, color: "auto" },
    borders: B,
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
        children: [tr(value, { size: SZ.statValue, color: colors.text, bold: true })],
      }),
    ],
  });
}

export function statRow(cards: [string, string, MetricStatus?][]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cards.map(() => Math.round(CONTENT_WIDTH / cards.length)),
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: cards.map(([l, v, s]) => statCard(l, v, s ?? "info")) })],
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
        tr("Book a call: ", { size: SZ.body }),
        new ExternalHyperlink({
          link: "https://cal.com/romil-depala-sabsp0/30min",
          children: [tr("cal.com/romil-depala-sabsp0/30min", { bold: true, size: SZ.body, color: C.brand })],
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({ children: [tr("This report was generated by MVRX Labs.", { size: SZ.signSm, color: C.gray })] }),
  ];
}

/** Max image width in pixels (fits body content area with some padding) */
const MAX_IMAGE_WIDTH = 620;

/** Screenshot image with a subtle border and italic caption below */
export function screenshotBlock(
  imageBuffer: Buffer,
  caption: string,
  imgWidth: number,
  imgHeight: number
): Paragraph[] {
  const scale = Math.min(1, MAX_IMAGE_WIDTH / imgWidth);
  const renderW = Math.round(imgWidth * scale);
  const renderH = Math.round(imgHeight * scale);

  // Detect format from buffer magic bytes (JPEG: FF D8, PNG: 89 50)
  const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
  const imageType = isJpeg ? "jpg" : "png";

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [
        new ImageRun({
          type: imageType,
          data: imageBuffer,
          transformation: { width: renderW, height: renderH },
          outline: {
            type: "solidFill",
            solidFillType: "rgb",
            value: C.tableBorder,
            width: 12700, // 1pt in EMUs
          },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [tr(caption, { size: SZ.dataSrc, color: C.gray, italics: true })],
    }),
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
            style: { paragraph: { indent: { left: 600, hanging: 300 } } },
          },
        ],
      },
    ],
  };
}
