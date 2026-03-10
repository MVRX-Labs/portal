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
  bCell,
  altFill,
  statRow,
} from "../styles";

export function linkedinAuditSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const li = c.linkedinAudit;
  const out: (Paragraph | Table)[] = [
    pageBreak(),
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
          (t, i) =>
            new TableRow({
              children: [
                bCell(t.theme, { bold: true, fill: altFill(i) }),
                bCell(`${t.count}`, { fill: altFill(i) }),
                bCell(t.avgLikes, { fill: altFill(i) }),
                bCell(t.avgComments, { fill: altFill(i) }),
                bCell(t.avgReposts, { fill: altFill(i) }),
                bCell(t.assessment, { fill: altFill(i) }),
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
          (p, i) =>
            new TableRow({
              children: [
                bCell(p.post, { bold: true, fill: altFill(i) }),
                bCell(`${p.likes}`, { fill: altFill(i) }),
                bCell(`${p.comments}`, { fill: altFill(i) }),
                bCell(p.engRate, { fill: altFill(i) }),
                bCell(p.hook, { fill: altFill(i) }),
                bCell(p.cta, { fill: altFill(i) }),
                bCell(p.story, { fill: altFill(i) }),
                bCell(`${p.score}`, { fill: altFill(i) }),
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
    pageBreak(),
    sectionH("Social SEO: Data-Backed Findings"),
    dataSourceP(s.dataSources),
    emptyPara(),
    bodyP(s.coreProblem),
    emptyPara(),
    makeTable(
      [20, 20, 30, 30],
      ["PLATFORM", "FOLLOWERS", "CONTENT", "TRAFFIC IMPACT"],
      s.platforms.map(
        (p, i) =>
          new TableRow({
            children: [
              bCell(p.platform, { bold: true, fill: altFill(i) }),
              bCell(p.followers, { fill: altFill(i) }),
              bCell(p.content, { fill: altFill(i) }),
              bCell(p.trafficImpact, { fill: altFill(i) }),
            ],
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
    pageBreak(),
    sectionH("AI Visibility & Technical AI Seeding"),
    dataSourceP(a.dataSources),
    emptyPara(),
    makeTable(
      [25, 20, 25, 30],
      ["BOT / FILE", "STATUS", "IMPACT", "ACTION"],
      a.botStatus.map(
        (b, i) =>
          new TableRow({
            children: [
              bCell(b.bot, { bold: true, fill: altFill(i) }),
              bCell(b.status, { fill: altFill(i) }),
              bCell(b.impact, { fill: altFill(i) }),
              bCell(b.action, { fill: altFill(i) }),
            ],
          })
      )
    ),
    emptyPara(),
    subH("Share of Model Baseline"),
    makeTable(
      [35, 20, 45],
      ["QUERY TESTED", "RESULT", "WHO RANKS INSTEAD"],
      a.shareOfModel.map(
        (s, i) =>
          new TableRow({
            children: [
              bCell(s.query, { bold: true, fill: altFill(i) }),
              bCell(s.result, { fill: altFill(i) }),
              bCell(s.whoRanks, { fill: altFill(i) }),
            ],
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
    pageBreak(),
    sectionH("Local Entity SEO"),
    dataSourceP(e.dataSources),
    emptyPara(),
    makeTable(
      [22, 15, 30, 33],
      ["PLATFORM", "STATUS", "DATA", "ACTION"],
      e.platforms.map(
        (p, i) =>
          new TableRow({
            children: [
              bCell(p.platform, { bold: true, fill: altFill(i) }),
              bCell(p.status, { fill: altFill(i) }),
              bCell(p.data, { fill: altFill(i) }),
              bCell(p.action, { fill: altFill(i) }),
            ],
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
    pageBreak(),
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
        (m, i) =>
          new TableRow({
            children: [
              bCell(m.post, { bold: true, fill: altFill(i) }),
              bCell(m.subreddit, { fill: altFill(i) }),
              bCell(m.score, { fill: altFill(i) }),
              bCell(m.comments, { fill: altFill(i) }),
              bCell(m.type, { fill: altFill(i) }),
              bCell(m.detail, { fill: altFill(i) }),
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
