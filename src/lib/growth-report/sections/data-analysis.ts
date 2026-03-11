import { Paragraph, Table, TableRow } from "docx";
import type { GrowthReportContent } from "../schema";
import {
  sectionH,
  subH,
  dataSourceP,
  bullet,
  emptyPara,
  makeTable,
  hCell,
  bCell,
  scoreColor,
  statRow,
  C,
} from "../styles";

export function trafficSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const t = c.trafficAnalysis!;
  return [
    sectionH("Traffic & Audience Analysis"),
    dataSourceP(t.dataSource),
    emptyPara(),
    makeTable(
      [50, 50],
      ["METRIC", "VALUE"],
      t.metrics.map(
        (m) =>
          new TableRow({
            children: [bCell(m.metric), bCell(m.value)],
          })
      )
    ),
    emptyPara(),
    subH("Traffic Sources"),
    makeTable(
      [25, 25, 25, 25],
      ["SEARCH", "DIRECT", "REFERRAL", "SOCIAL"],
      [
        new TableRow({
          children: [
            bCell(t.trafficSources.search, { bold: true }),
            bCell(t.trafficSources.direct, { bold: true }),
            bCell(t.trafficSources.referral, { bold: true }),
            bCell(t.trafficSources.social, { bold: true }),
          ],
        }),
      ]
    ),
    emptyPara(),
    ...t.findings.map((f) => bullet(f)),
  ];
}

export function domainAuthoritySection(c: GrowthReportContent): (Paragraph | Table)[] {
  const d = c.domainAuthority!;
  return [
    sectionH("Domain Authority & Backlink Profile"),
    dataSourceP(d.dataSource),
    emptyPara(),
    makeTable(
      [50, 50],
      ["METRIC", "VALUE"],
      d.metrics.map(
        (m) =>
          new TableRow({
            children: [bCell(m.metric), bCell(m.value)],
          })
      )
    ),
    emptyPara(),
    ...d.findings.map((f) => bullet(f)),
    emptyPara(),
    subH("Link Building Opportunities"),
    ...d.linkOpportunities.map((o) => bullet(o)),
  ];
}

export function siteAuditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const s = c.siteAudit!;
  const catEntries = Object.entries(s.categoryScores);
  const row1 = catEntries.slice(0, 3);
  const row2 = catEntries.slice(3, 6);
  return [
    sectionH(`On-Site SEO Audit (${s.summaryStats.pagesAudited} Pages)`),
    dataSourceP(s.dataSource),
    emptyPara(),
    statRow([
      ["PAGES AUDITED", `${s.summaryStats.pagesAudited}`],
      ["AVG SCORE", `${s.summaryStats.avgScore}`],
      ["404 ERRORS", `${s.summaryStats.errors404}`],
    ]),
    emptyPara(),
    ...(row1.length ? [statRow(row1.map(([k, v]) => [k.toUpperCase(), `${v}`] as [string, string]))] : []),
    ...(row2.length ? [emptyPara(), statRow(row2.map(([k, v]) => [k.toUpperCase(), `${v}`] as [string, string]))] : []),
    emptyPara(),
    subH("Page-by-Page Breakdown"),
    makeTable(
      [20, 8, 8, 8, 8, 8, 8, 10, 10],
      ["PAGE", "SCORE", "META", "HEAD", "CONT", "TECH", "SCHEMA", "WORDS", "TYPE"],
      s.pageBreakdown.map(
        (p) =>
          new TableRow({
            children: [
              bCell(p.page),
              bCell(`${p.score}`, { color: scoreColor(p.score) }),
              bCell(`${p.meta}`),
              bCell(`${p.headings}`),
              bCell(`${p.content}`),
              bCell(`${p.technical}`),
              bCell(`${p.schema}`),
              bCell(p.words),
              bCell(p.type),
            ],
          })
      )
    ),
    emptyPara(),
    subH("Critical Issues"),
    ...s.criticalIssues.map((issue) => bullet(issue)),
  ];
}

export function competitiveSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const b = c.competitiveBenchmarking!;
  return [
    sectionH("Competitive Benchmarking"),
    dataSourceP(b.dataSources),
    emptyPara(),
    makeTable(
      [15, 10, 8, 7, 12, 10, 10, 10, 8],
      ["SITE", "VISITS", "RANK", "DR", "BACKLINKS", "REF DOM", "SEARCH", "BOUNCE", "PG/VIS"],
      b.competitors.map(
        (r) =>
          new TableRow({
            children: [
              bCell(r.site),
              bCell(r.visits),
              bCell(r.countryRank),
              bCell(r.dr),
              bCell(r.backlinks),
              bCell(r.refDomains),
              bCell(r.search),
              bCell(r.bounce),
              bCell(r.pagesPerVisit),
            ],
          })
      )
    ),
    emptyPara(),
    ...b.findings.map((f) => bullet(f)),
  ];
}

export function contentAuditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const a = c.contentAudit!;
  return [
    sectionH("Content & Blog Audit"),
    dataSourceP(a.dataSource),
    emptyPara(),
    makeTable(
      [25, 8, 8, 8, 12, 10, 18],
      ["ARTICLE", "SCORE", "DESC", "H1", "SCHEMA", "WORDS", "STATUS"],
      a.articles.map(
        (r) =>
          new TableRow({
            children: [
              bCell(r.article),
              bCell(r.score),
              bCell(r.metaDesc, {
                color: r.metaDesc === "\u2713" ? C.green : r.metaDesc === "\u2717" ? C.red : undefined,
              }),
              bCell(r.h1, { color: r.h1 === "\u2713" ? C.green : r.h1 === "\u2717" ? C.red : undefined }),
              bCell(r.schema),
              bCell(r.words),
              bCell(r.status),
            ],
          })
      )
    ),
    emptyPara(),
    ...a.findings.map((f) => bullet(f)),
  ];
}
