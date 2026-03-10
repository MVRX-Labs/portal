import { Paragraph, Table, TableRow } from "docx";
import type { GrowthReportContent } from "../schema";
import { sectionH, subH, dataSourceP, bullet, bodyP, emptyPara, makeTable, bCell, statRow } from "../styles";

export function linkedinAuditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const li = c.linkedinAudit;
  const out: (Paragraph | Table)[] = [
    sectionH("LinkedIn Audit"),
    dataSourceP(li.dataSources),
    emptyPara(),
    statRow(li.profiles.map((p) => [p.label, p.followers] as [string, string])),
    emptyPara(),
    statRow(li.engagementStats.map((e) => [e.label, e.value] as [string, string])),
  ];

  if (li.companyThemes.length) {
    out.push(emptyPara(), subH("Company Page: Theme Analysis"));
    out.push(
      makeTable(
        [18, 8, 10, 10, 10, 44],
        ["THEME", "#", "AVG LIKE", "AVG CMT", "AVG RPT", "ASSESSMENT"],
        li.companyThemes.map(
          (t) =>
            new TableRow({
              children: [
                bCell(t.theme),
                bCell(`${t.count}`),
                bCell(t.avgLikes),
                bCell(t.avgComments),
                bCell(t.avgReposts),
                bCell(t.assessment),
              ],
            })
        )
      )
    );
  }

  if (li.founderPosts?.length) {
    out.push(emptyPara(), subH("Founder Post Scoring"));
    out.push(
      makeTable(
        [22, 8, 8, 8, 8, 8, 8, 8],
        ["POST", "LIKES", "CMT", "ENG%", "HOOK", "CTA", "STORY", "SCORE"],
        li.founderPosts.map(
          (p) =>
            new TableRow({
              children: [
                bCell(p.post),
                bCell(`${p.likes}`),
                bCell(`${p.comments}`),
                bCell(p.engRate),
                bCell(p.hook),
                bCell(p.cta),
                bCell(p.story),
                bCell(`${p.score}`),
              ],
            })
        )
      )
    );
  }

  out.push(emptyPara(), ...li.findings.map((f) => bullet(f)));
  return out;
}

export function socialSeoSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const s = c.socialSeo;
  return [
    sectionH("Social SEO: Data-Backed Findings"),
    dataSourceP(s.dataSources),
    emptyPara(),
    bodyP(s.coreProblem, { bold: true }),
    emptyPara(),
    makeTable(
      [20, 20, 30, 30],
      ["PLATFORM", "FOLLOWERS", "CONTENT", "TRAFFIC IMPACT"],
      s.platforms.map(
        (p) =>
          new TableRow({
            children: [bCell(p.platform), bCell(p.followers), bCell(p.content), bCell(p.trafficImpact)],
          })
      )
    ),
    emptyPara(),
    ...s.findings.map((f) => bullet(f)),
  ];
}

export function aiVisibilitySection(c: GrowthReportContent): (Paragraph | Table)[] {
  const a = c.aiVisibility;
  return [
    sectionH("AI Visibility & Technical AI Seeding"),
    dataSourceP(a.dataSources),
    emptyPara(),
    makeTable(
      [25, 20, 25, 30],
      ["BOT / FILE", "STATUS", "IMPACT", "ACTION"],
      a.botStatus.map(
        (b) =>
          new TableRow({
            children: [bCell(b.bot), bCell(b.status), bCell(b.impact), bCell(b.action)],
          })
      )
    ),
    emptyPara(),
    subH("Share of Model Baseline"),
    makeTable(
      [35, 20, 45],
      ["QUERY TESTED", "RESULT", "WHO RANKS INSTEAD"],
      a.shareOfModel.map(
        (s) =>
          new TableRow({
            children: [bCell(s.query), bCell(s.result), bCell(s.whoRanks)],
          })
      )
    ),
    emptyPara(),
    ...a.findings.map((f) => bullet(f)),
  ];
}

export function entitySeoSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const e = c.entitySeo;
  return [
    sectionH("Local Entity SEO"),
    dataSourceP(e.dataSources),
    emptyPara(),
    makeTable(
      [22, 15, 30, 33],
      ["PLATFORM", "STATUS", "DATA", "ACTION"],
      e.platforms.map(
        (p) =>
          new TableRow({
            children: [bCell(p.platform), bCell(p.status), bCell(p.data), bCell(p.action)],
          })
      )
    ),
    emptyPara(),
    ...e.findings.map((f) => bullet(f)),
  ];
}

export function redditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  if (!c.redditAudit) return [];
  const r = c.redditAudit;
  return [
    sectionH("Reddit Presence Audit"),
    dataSourceP(r.dataSource),
    bodyP(r.overview),
    emptyPara(),
    statRow([
      ["BRAND MENTIONS", r.summaryStats.brandMentions],
      ["SENTIMENT", r.summaryStats.sentiment],
      ["TOP SUBREDDITS", r.summaryStats.topSubreddits],
    ]),
    emptyPara(),
    subH("Reddit Mentions Breakdown"),
    makeTable(
      [22, 14, 8, 8, 12, 36],
      ["POST", "SUBREDDIT", "SCORE", "CMTS", "TYPE", "DETAIL"],
      r.mentions.map(
        (m) =>
          new TableRow({
            children: [
              bCell(m.post),
              bCell(m.subreddit),
              bCell(m.score),
              bCell(m.comments),
              bCell(m.type),
              bCell(m.detail),
            ],
          })
      )
    ),
    emptyPara(),
    subH("Key Findings"),
    ...r.findings.map((f) => bullet(f)),
    emptyPara(),
    subH("Recommendations"),
    ...r.recommendations.map((rec) => bullet(rec)),
  ];
}
