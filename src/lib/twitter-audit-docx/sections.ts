import { Paragraph, Table, TableRow, WidthType, AlignmentType, TableLayoutType, ExternalHyperlink } from "docx";
import type { TwitterAuditContent } from "../audit-schema";
import {
  tr,
  emptyPara,
  sectionHeading,
  subHeading,
  bodyPara,
  pageBreak,
  renderBlocks,
  scoreColor,
  headerCell,
  bodyCell,
  BULLET_REF,
  C,
  S,
  CONTENT_WIDTH,
} from "./styles";

export function coverPage(c: TwitterAuditContent): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400 },
      children: [tr("MVRX LABS", { bold: true, size: S.brand, color: C.brand })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
      children: [tr("Twitter Audit", { bold: true, size: S.docTitle, color: C.darkNavy })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [tr(c.personName, { size: S.name, color: C.body })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [tr(`@${c.twitterHandle}`, { size: S.role, color: C.body })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [tr(c.preparedDate, { size: S.meta, color: C.meta, italics: true })],
    }),
  ];
}

export function executiveSummarySection(c: TwitterAuditContent): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(sectionHeading("1. Executive Summary"));
  for (const bullet of c.executiveSummary) {
    out.push(
      new Paragraph({
        numbering: { reference: BULLET_REF, level: 0 },
        spacing: { after: 80 },
        children: [tr(bullet)],
      })
    );
  }
  out.push(emptyPara());
  return out;
}

export function scorecardSection(c: TwitterAuditContent): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(sectionHeading("2. Scorecard"));

  const cols = [25, 15, 60];
  const dataRows = c.scorecard.map((e, rowIndex) => {
    const sc = scoreColor(e.score);
    const rowFill = rowIndex % 2 === 0 ? C.tableRowAlt : C.white;
    return new TableRow({
      children: [
        bodyCell(e.category, { bold: true, color: C.darkNavy, fill: rowFill }),
        bodyCell(`${e.score} / 10`, { bold: true, color: sc, fill: rowFill }),
        bodyCell(e.commentary, { fill: rowFill }),
      ],
    });
  });

  out.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [headerCell("Category", 25), headerCell("Score", 15), headerCell("Commentary", 60)],
        }),
        ...dataRows,
      ],
    })
  );

  out.push(emptyPara({ after: 40 }));
  out.push(emptyPara({ after: 100 }));

  out.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [tr(`Overall Score: ${c.overallScore.toFixed(1)} / 10`, { bold: true, size: 24, color: C.brand })],
    })
  );

  out.push(emptyPara());
  return out;
}

let sectionCounter = 3;

export function resetSectionCounter() {
  sectionCounter = 3;
}

export function contentSections(c: TwitterAuditContent): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  sectionCounter = 3;

  for (const section of c.sections) {
    out.push(pageBreak());
    out.push(sectionHeading(`${sectionCounter}. ${section.title}`));
    sectionCounter++;

    if (section.subsections) {
      for (const sub of section.subsections) {
        out.push(subHeading(sub.title));
        out.push(...renderBlocks(sub.content));
      }
    }

    if (section.content) {
      out.push(...renderBlocks(section.content));
    }
  }

  return out;
}

export function signOff(): (Paragraph | Table)[] {
  return [
    emptyPara({ after: 200 }),
    emptyPara({ after: 120 }),
    new Paragraph({
      spacing: { after: 40 },
      children: [tr("Next Step", { bold: true, size: 22, color: C.darkNavy })],
    }),
    bodyPara(
      "If this is interesting, the next step is a 30-minute call to talk through priorities and see if there\u2019s a fit."
    ),
    emptyPara({ after: 40 }),
    new Paragraph({
      children: [
        tr("Book a call: ", { size: S.body }),
        new ExternalHyperlink({
          link: "https://cal.com/romil-depala-sabsp0/30min",
          children: [tr("cal.com/romil-depala-sabsp0/30min", { bold: true, size: S.body, color: C.brand })],
        }),
      ],
    }),
    emptyPara({ after: 200 }),
    new Paragraph({
      children: [tr("MVRX LABS", { bold: true, size: S.signoffBrand, color: C.brand })],
    }),
    new Paragraph({
      children: [tr("The Attention Lab", { size: S.signoffTag, color: C.meta, italics: true })],
    }),
  ];
}
