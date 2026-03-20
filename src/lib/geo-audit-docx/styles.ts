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
  greenBg: "F0FDF4",
  amberBg: "FFFBEB",
  redBg: "FEF2F2",
  purpleBg: "F3F0FF",
} as const;

export const SZ = {
  brand: 28,
  title: 48,
  subtitle: 36,
  metaMd: 22,
  metaSm: 18,
  dataSrc: 16,
  sectionH: 40,
  subH: 28,
  body: 20,
  cell: 18,
  statLabel: 14,
  statValue: 36,
  headerFooter: 14,
  signBrand: 28,
  signTag: 22,
  signSm: 16,
} as const;

export const PAGE_WIDTH = 12240;
export const PAGE_HEIGHT = 15840;
export const COVER_MARGIN = 1440;
export const BODY_MARGIN_TB = 1200;
export const BODY_MARGIN_LR = 1100;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * BODY_MARGIN_LR;
export const BULLET_REF = "geo-bullets";

const B = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

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
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 100, after: 200 },
    children: [tr(text, { bold: true, size: SZ.sectionH, color: C.brand })],
  });
}

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

export function severityColor(s: string): string {
  if (s === "critical") return C.red;
  if (s === "high") return C.orange;
  if (s === "medium") return "B45309";
  return C.gray;
}

export function severityBg(s: string): string {
  if (s === "critical") return C.redBg;
  if (s === "high") return C.amberBg;
  if (s === "medium") return "FFFBEB";
  return "F9FAFB";
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
