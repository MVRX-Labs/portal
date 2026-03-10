import { Paragraph, Table, TableRow } from "docx";
import type { GrowthReportContent } from "../schema";
import {
  sectionH,
  subH,
  dataSourceP,
  bullet,
  bodyP,
  emptyPara,
  pageBreak,
  makeTable,
  hCell,
  bCell,
  altFill,
  scoreColor,
  statRow,
} from "../styles";

export function trafficSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const t = c.trafficAnalysis;
  return [
    pageBreak(),
    sectionH("Traffic & Audience Analysis"),
    dataSourceP(t.dataSource),
    emptyPara(),
    makeTable(
      [50, 50],
      ["METRIC", "VALUE"],
      t.metrics.map(
        (m, i) =>
          new TableRow({
            children: [bCell(m.metric, { bold: true, fill: altFill(i) }), bCell(m.value, { fill: altFill(i) })],
          })
      )
    ),
    emptyPara(),
    subH("Traffic Sources"),
    statRow([
      ["SEARCH", t.trafficSources.search],
      ["DIRECT", t.trafficSources.direct],
      ["REFERRAL", t.trafficSources.referral],
      ["SOCIAL", t.trafficSources.social],
    ]),
    emptyPara(),
    ...t.findings.map((f) => bullet(f)),
  ];
}

export function domainAuthoritySection(c: GrowthReportContent): (Paragraph | Table)[] {
  const d = c.domainAuthority;
  return [
    pageBreak(),
    sectionH("Domain Authority & Backlink Profile"),
    dataSourceP(d.dataSource),
    emptyPara(),
    makeTable(
      [50, 50],
      ["METRIC", "VALUE"],
      d.metrics.map(
        (m, i) =>
          new TableRow({
            children: [bCell(m.metric, { bold: true, fill: altFill(i) }), bCell(m.value, { fill: altFill(i) })],
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
  const s = c.siteAudit;
  const catEntries = Object.entries(s.categoryScores);
  const row1 = catEntries.slice(0, 3);
  const row2 = catEntries.slice(3, 6);
  return [
    pageBreak(),
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
        (p, i) =>
          new TableRow({
            children: [
              bCell(p.page, { bold: true, fill: altFill(i) }),
              bCell(`${p.score}`, { color: scoreColor(p.score), fill: altFill(i) }),
              bCell(`${p.meta}`, { fill: altFill(i) }),
              bCell(`${p.headings}`, { fill: altFill(i) }),
              bCell(`${p.content}`, { fill: altFill(i) }),
              bCell(`${p.technical}`, { fill: altFill(i) }),
              bCell(`${p.schema}`, { fill: altFill(i) }),
              bCell(p.words, { fill: altFill(i) }),
              bCell(p.type, { fill: altFill(i) }),
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
  const b = c.competitiveBenchmarking;
  return [
    pageBreak(),
    sectionH("Competitive Benchmarking"),
    dataSourceP(b.dataSources),
    emptyPara(),
    makeTable(
      [15, 10, 8, 7, 12, 10, 10, 10, 8],
      ["SITE", "VISITS", "RANK", "DR", "BACKLINKS", "REF DOM", "SEARCH", "BOUNCE", "PG/VIS"],
      b.competitors.map(
        (r, i) =>
          new TableRow({
            children: [
              bCell(r.site, { bold: true, fill: altFill(i) }),
              bCell(r.visits, { fill: altFill(i) }),
              bCell(r.countryRank, { fill: altFill(i) }),
              bCell(r.dr, { fill: altFill(i) }),
              bCell(r.backlinks, { fill: altFill(i) }),
              bCell(r.refDomains, { fill: altFill(i) }),
              bCell(r.search, { fill: altFill(i) }),
              bCell(r.bounce, { fill: altFill(i) }),
              bCell(r.pagesPerVisit, { fill: altFill(i) }),
            ],
          })
      )
    ),
    emptyPara(),
    ...b.findings.map((f) => bullet(f)),
  ];
}

export function contentAuditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const a = c.contentAudit;
  return [
    pageBreak(),
    sectionH("Content & Blog Audit"),
    dataSourceP(a.dataSource),
    emptyPara(),
    makeTable(
      [25, 8, 8, 8, 12, 10, 18],
      ["ARTICLE", "SCORE", "DESC", "H1", "SCHEMA", "WORDS", "STATUS"],
      a.articles.map(
        (r, i) =>
          new TableRow({
            children: [
              bCell(r.article, { bold: true, fill: altFill(i) }),
              bCell(r.score, { fill: altFill(i) }),
              bCell(r.metaDesc, { fill: altFill(i) }),
              bCell(r.h1, { fill: altFill(i) }),
              bCell(r.schema, { fill: altFill(i) }),
              bCell(r.words, { fill: altFill(i) }),
              bCell(r.status, { fill: altFill(i) }),
            ],
          })
      )
    ),
    emptyPara(),
    ...a.findings.map((f) => bullet(f)),
  ];
}
