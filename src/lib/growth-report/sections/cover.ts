import { Paragraph, Table } from "docx";
import type { GrowthReportContent } from "../schema";
import { tr, emptyPara, C, SZ, statRow, bodyP } from "../styles";

export function coverPage(c: GrowthReportContent): (Paragraph | Table)[] {
  return [
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({ children: [tr("MVRX LABS", { bold: true, size: SZ.brand, color: C.brand })] }),
    emptyPara(),
    new Paragraph({ children: [tr("Complete SEO &", { bold: true, size: SZ.title, color: C.dark })] }),
    new Paragraph({ children: [tr("Growth Strategy Report", { bold: true, size: SZ.title, color: C.dark })] }),
    emptyPara(),
    new Paragraph({ children: [tr(c.websiteUrl, { size: SZ.subtitle, color: C.brand })] }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("Site Audit \u2022 Traffic Analysis \u2022 Domain Authority \u2022 Competitive Benchmarking", {
          size: SZ.metaSm,
          color: C.gray,
        }),
      ],
    }),
    new Paragraph({
      children: [
        tr("Content Audit \u2022 LinkedIn Strategy \u2022 Social SEO \u2022 AI Visibility", {
          size: SZ.metaSm,
          color: C.gray,
        }),
      ],
    }),
    new Paragraph({
      children: [
        tr("Reddit Presence \u2022 Local Entity \u2022 Case Studies \u2022 Statement of Work \u2022 Pricing", {
          size: SZ.metaSm,
          color: C.gray,
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("Prepared for: ", { size: SZ.metaMd, color: C.gray }),
        tr(c.preparedFor, { size: SZ.metaMd, bold: true }),
      ],
    }),
    new Paragraph({
      children: [tr("Date: ", { size: SZ.metaMd, color: C.gray }), tr(c.preparedDate, { size: SZ.metaMd })],
    }),
    new Paragraph({
      children: [tr("Prepared by: ", { size: SZ.metaMd, color: C.gray }), tr("MVRX Labs", { size: SZ.metaMd })],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("Data sources: ", { size: SZ.dataSrc, color: C.gray }),
        tr(c.dataSources.join(", "), { size: SZ.dataSrc, color: C.gray }),
      ],
    }),
    emptyPara(),
    new Paragraph({ children: [tr("CONFIDENTIAL", { size: SZ.metaSm, color: C.gray, bold: true })] }),
  ];
}

/** Executive summary with KPI stat cards (semantic colors) */
export function executiveSummary(c: GrowthReportContent): (Paragraph | Table)[] {
  const m = c.keyMetrics;
  return [
    bodyP(c.executiveSummary.overview),
    emptyPara(),
    statRow([
      ["MONTHLY VISITS", m.monthlyVisits.value, m.monthlyVisits.status],
      ["COUNTRY RANK", m.countryRank.value, m.countryRank.status],
      ["DOMAIN RATING", m.domainRating.value, m.domainRating.status],
    ]),
    emptyPara(),
    statRow([
      ["ON-SITE SCORE", m.onSiteScore.value, m.onSiteScore.status],
      ["SEARCH TRAFFIC", m.searchTraffic.value, m.searchTraffic.status],
      ["BACKLINKS", m.backlinks.value, m.backlinks.status],
    ]),
    emptyPara(),
    statRow([
      ["IG FOLLOWERS", m.igFollowers.value, m.igFollowers.status],
      ["TIKTOK", m.tiktokFollowers.value, m.tiktokFollowers.status],
      ["LINKEDIN (CO)", m.linkedinFollowers.value, m.linkedinFollowers.status],
    ]),
    emptyPara(),
    bodyP(c.executiveSummary.keyConclusion, { bold: true }),
  ];
}
