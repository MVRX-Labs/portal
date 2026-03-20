/**
 * Formats a weekly analytics report as Slack Block Kit message.
 */

import type { WeeklyReportData } from "./analytics-report";

function fmtDelta(v: number): string {
  if (v === 0) return "—";
  return v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Strip query params from LinkedIn URLs to keep them short and prevent unfurl issues */
function cleanPostUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function buildAnalyticsSlackMessage(report: WeeklyReportData): {
  text: string;
  blocks: Record<string, unknown>[];
  unfurl_links: boolean;
  unfurl_media: boolean;
} | null {
  // Don't send a report if there were no posts this week
  if (report.summary.newPostsThisWeek === 0) return null;
  const s = report.summary;
  const period = `${fmtDate(report.weekStart)} — ${fmtDate(report.weekEnd)}`;

  const blocks: Record<string, unknown>[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `Weekly Report — ${report.displayName}`, emoji: true },
  });

  // Period
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${period}  ·  <${cleanPostUrl(report.linkedinUrl)}|LinkedIn Profile>` }],
  });

  blocks.push({ type: "divider" });

  // KPIs — skip when only 1 post (best post section already covers it)
  if (s.newPostsThisWeek > 1) {
    const cadence = s.hasComparison
      ? `${s.newPostsThisWeek} posts (${s.postsLastWeek} last week)`
      : `${s.newPostsThisWeek} posts`;

    const engLine = s.hasComparison
      ? `*${s.engagementThisWeek.toLocaleString()}*  (${fmtDelta(s.deltaEngagement)} WoW)`
      : `*${s.engagementThisWeek.toLocaleString()}*`;

    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Posts Published*\n${cadence}` },
        { type: "mrkdwn", text: `*Avg Eng / Post*\n${s.avgEngagementPerPost.toLocaleString()}` },
        { type: "mrkdwn", text: `*This Week*\n${engLine}` },
        // { type: "mrkdwn", text: `*All-Time*\n${s.totalPosts} posts · ${s.totalEngagement.toLocaleString()} eng` },
      ],
    });
  }

  // Best post — just stats + link, no snippet
  if (report.bestPostThisWeek) {
    const bp = report.bestPostThisWeek;
    const link = bp.postUrl ? ` · <${cleanPostUrl(bp.postUrl)}|View Post>` : "";
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Best Post This Week*\n${bp.likes} likes · ${bp.comments} comments · ${bp.reposts} reposts · *${bp.engagement} total*${link}`,
      },
    });
  }

  // New posts — just link + engagement, no content snippets
  if (report.newPosts.length > 0) {
    blocks.push({ type: "divider" });
    const postLines = report.newPosts.map((p, i) => {
      const label = p.postUrl ? `<${cleanPostUrl(p.postUrl)}|Post ${i + 1}>` : `Post ${i + 1}`;
      return `${label}  —  *${p.engagement.toLocaleString()}* eng  (${p.likes} likes, ${p.comments} comments, ${p.reposts} reposts)`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Posts Published (${report.newPosts.length})*\n${postLines.join("\n")}` },
    });
  }

  // Cumulative summary — commented out until we clarify what "all-time" should mean
  // if (s.hasComparison) {
  //   blocks.push({ type: "divider" });
  //   blocks.push({
  //     type: "context",
  //     elements: [{
  //       type: "mrkdwn",
  //       text: `All-time: ${s.totalLikes.toLocaleString()} likes (${fmtDelta(s.deltaLikes)}) · ${s.totalComments.toLocaleString()} comments (${fmtDelta(s.deltaComments)}) · ${s.totalReposts.toLocaleString()} reposts (${fmtDelta(s.deltaReposts)})`,
  //     }],
  //   });
  // }

  const fallbackText = `Weekly Report — ${report.displayName} (${period}): ${s.newPostsThisWeek} posts, ${s.engagementThisWeek.toLocaleString()} engagement`;

  return { text: fallbackText, blocks, unfurl_links: false, unfurl_media: false };
}
