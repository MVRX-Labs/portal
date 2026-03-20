import { Paragraph, Table, TableRow, ExternalHyperlink } from "docx";
import type { GeoAuditContent, ScoreCategory } from "./schema";
import { scoreStatus } from "./schema";
import {
  tr,
  emptyPara,
  C,
  SZ,
  sectionH,
  subH,
  bodyP,
  bullet,
  statRow,
  makeTable,
  bCell,
  scoreColor,
  severityColor,
  severityBg,
} from "./styles";

const WEIGHTS: Record<string, number> = {
  citability: 25,
  brandAuthority: 20,
  contentEeat: 20,
  technical: 15,
  schema: 10,
  platformOptimization: 10,
};

const LABELS: Record<string, string> = {
  citability: "AI Citability",
  brandAuthority: "Brand Authority",
  contentEeat: "Content & E-E-A-T",
  technical: "Technical",
  schema: "Schema / Structured Data",
  platformOptimization: "Platform Optimization",
};

const ALL_SECTIONS = [
  "Executive Summary",
  "Score Breakdown",
  "Critical Issues",
  "AI Citability",
  "Brand Authority",
  "Content & E-E-A-T",
  "Technical",
  "Schema / Structured Data",
  "Platform Optimization",
  "Quick Wins",
  "30-Day Action Plan",
];

export function coverPage(c: GeoAuditContent): (Paragraph | Table)[] {
  return [
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({ children: [tr("MVRX LABS", { bold: true, size: SZ.brand, color: C.brand })] }),
    emptyPara(),
    new Paragraph({ children: [tr("GEO Audit Report", { bold: true, size: SZ.title, color: C.dark })] }),
    new Paragraph({
      children: [tr("Generative Engine Optimization", { size: SZ.subtitle, color: C.gray })],
    }),
    emptyPara(),
    new Paragraph({ children: [tr(c.url, { size: SZ.subtitle, color: C.brand })] }),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [
        tr("AI Citability \u2022 Brand Authority \u2022 Content & E-E-A-T", {
          size: SZ.metaSm,
          color: C.gray,
        }),
      ],
    }),
    new Paragraph({
      children: [
        tr("Technical SEO \u2022 Schema & Structured Data \u2022 Platform Optimization", {
          size: SZ.metaSm,
          color: C.gray,
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({
      children: [tr("Brand: ", { size: SZ.metaMd, color: C.gray }), tr(c.brandName, { size: SZ.metaMd, bold: true })],
    }),
    new Paragraph({
      children: [tr("Date: ", { size: SZ.metaMd, color: C.gray }), tr(c.date, { size: SZ.metaMd })],
    }),
    new Paragraph({
      children: [tr("Prepared by: ", { size: SZ.metaMd, color: C.gray }), tr("MVRX Labs", { size: SZ.metaMd })],
    }),
    emptyPara(),
    new Paragraph({ children: [tr("CONFIDENTIAL", { size: SZ.metaSm, color: C.gray, bold: true })] }),
  ];
}

/** Static TOC — works in Google Docs unlike auto-generated TOC fields */
export function staticToc(): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 300 },
      children: [tr("Contents", { bold: true, size: SZ.sectionH, color: C.brand })],
    }),
  ];

  for (let i = 0; i < ALL_SECTIONS.length; i++) {
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [tr(`${i + 1}.  `, { size: SZ.body, color: C.gray }), tr(ALL_SECTIONS[i], { size: SZ.body })],
      })
    );
  }

  return out;
}

export function executiveSummary(c: GeoAuditContent): (Paragraph | Table)[] {
  const s = c.scores;
  const out: (Paragraph | Table)[] = [];

  // Short overview
  out.push(bodyP(c.executiveSummary.overview));
  out.push(emptyPara());

  // Stat cards
  out.push(
    statRow([
      ["GEO SCORE", `${c.geoScore}/100`, scoreStatus(c.geoScore)],
      ["AI CITABILITY", `${s.citability.score}/100`, scoreStatus(s.citability.score)],
      ["BRAND AUTHORITY", `${s.brandAuthority.score}/100`, scoreStatus(s.brandAuthority.score)],
    ]),
    emptyPara(),
    statRow([
      ["CONTENT & E-E-A-T", `${s.contentEeat.score}/100`, scoreStatus(s.contentEeat.score)],
      ["TECHNICAL", `${s.technical.score}/100`, scoreStatus(s.technical.score)],
      ["SCHEMA", `${s.schema.score}/100`, scoreStatus(s.schema.score)],
    ]),
    emptyPara()
  );

  // Key findings as bullets
  if (c.executiveSummary.keyFindings.length > 0) {
    out.push(bodyP("Key Findings:", { bold: true }));
    for (const f of c.executiveSummary.keyFindings) out.push(bullet(f));
    out.push(emptyPara());
  }

  return out;
}

export function scoreBreakdown(c: GeoAuditContent): (Paragraph | Table)[] {
  const keys = Object.keys(WEIGHTS) as (keyof typeof c.scores)[];
  const rows = keys.map((key) => {
    const score = c.scores[key].score;
    const weight = WEIGHTS[key];
    const weighted = Math.round((score * weight) / 100);
    return new TableRow({
      children: [
        bCell(LABELS[key], { bold: true }),
        bCell(`${score}`, { color: scoreColor(score), bold: true }),
        bCell(`${weight}%`),
        bCell(`${weighted}`, { bold: true }),
      ],
    });
  });

  rows.push(
    new TableRow({
      children: [
        bCell("GEO Score", { bold: true, fill: C.purpleBg }),
        bCell("", { fill: C.purpleBg }),
        bCell("", { fill: C.purpleBg }),
        bCell(`${c.geoScore}/100`, { bold: true, color: scoreColor(c.geoScore), fill: C.purpleBg }),
      ],
    })
  );

  return [makeTable([40, 20, 20, 20], ["Dimension", "Score", "Weight", "Weighted"], rows), emptyPara()];
}

export function criticalIssues(c: GeoAuditContent): (Paragraph | Table)[] {
  if (c.criticalIssues.length === 0) return [];

  const rows = c.criticalIssues.map(
    (issue) =>
      new TableRow({
        children: [
          bCell(issue.severity.toUpperCase(), {
            bold: true,
            color: severityColor(issue.severity),
            fill: severityBg(issue.severity),
          }),
          bCell(issue.title, { bold: true }),
          bCell(issue.description),
        ],
      })
  );

  return [makeTable([15, 30, 55], ["Severity", "Issue", "Description"], rows), emptyPara()];
}

/** Each category is its own page (sectionH has pageBreakBefore) */
export function categorySection(key: string, cat: ScoreCategory): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(
    sectionH(`${LABELS[key]}`),
    statRow([[LABELS[key].toUpperCase(), `${cat.score}/100`, scoreStatus(cat.score)]]),
    emptyPara()
  );

  if (cat.findings.length > 0) {
    out.push(subH("Key Findings"));
    for (const f of cat.findings) out.push(bullet(f));
    out.push(emptyPara());
  }

  if (cat.recommendations.length > 0) {
    out.push(subH("Recommendations"));
    for (const r of cat.recommendations) out.push(bullet(r));
    out.push(emptyPara());
  }

  return out;
}

export function quickWins(c: GeoAuditContent): (Paragraph | Table)[] {
  if (c.quickWins.length === 0) return [];
  const out: (Paragraph | Table)[] = [];
  for (const w of c.quickWins) out.push(bullet(w));
  out.push(emptyPara());
  return out;
}

export function actionPlan(c: GeoAuditContent): (Paragraph | Table)[] {
  if (c.actionPlan.length === 0) return [];

  const rows = c.actionPlan.flatMap((week) => {
    const first = new TableRow({
      children: [
        bCell(`Week ${week.week}`, { bold: true, fill: C.purpleBg }),
        bCell(week.theme, { bold: true, fill: C.purpleBg }),
      ],
    });
    const actionRows = week.actions.map(
      (action) =>
        new TableRow({
          children: [bCell(""), bCell(action)],
        })
    );
    return [first, ...actionRows];
  });

  return [makeTable([20, 80], ["Week", "Action"], rows), emptyPara()];
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
    new Paragraph({
      children: [tr("This report was generated by MVRX Labs.", { size: SZ.signSm, color: C.gray })],
    }),
  ];
}
