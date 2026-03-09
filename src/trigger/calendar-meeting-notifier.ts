import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarSyncState,
  users,
} from "@/lib/schema";
import { eq, and, gte, lt, isNull } from "drizzle-orm";
import { resolveSlackUserId, sendSlackDM } from "@/lib/slack";
import { gatherMeetingBriefing } from "@/lib/meeting-briefing";
import { generateTalkingPoints, buildBriefingSlackBlocks } from "@/lib/meeting-briefing-slack";

export const calendarMeetingNotifier = schedules.task({
  id: "calendar-meeting-notifier",
  cron: {
    pattern: "25,55 6-21 * * *",
    timezone: "Europe/London",
  },
  maxDuration: 120,
  retry: {
    maxAttempts: 1,
  },
  run: async () => {
    if (!process.env.SLACKBOT_TOKEN) {
      logger.warn("SLACKBOT_TOKEN not configured, skipping");
      return { notified: 0, total: 0, briefings: 0 };
    }

    const now = new Date();
    const in30Min = new Date(now.getTime() + 30 * 60 * 1000);

    // Find events starting in the next 30 minutes that haven't been notified yet
    const upcomingEvents = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          gte(calendarEvents.startTime, now),
          lt(calendarEvents.startTime, in30Min),
          eq(calendarEvents.status, "confirmed"),
          isNull(calendarEvents.notifiedAt)
        )
      );

    logger.info(`Found ${upcomingEvents.length} upcoming meetings to notify about`);

    let notified = 0;
    let briefings = 0;

    for (const event of upcomingEvents) {
      // Resolve the owning user via calendarSyncState
      const [syncRow] = await db
        .select({
          userId: calendarSyncState.userId,
          userEmail: users.email,
          userName: users.name,
        })
        .from(calendarSyncState)
        .innerJoin(users, eq(calendarSyncState.userId, users.id))
        .where(eq(calendarSyncState.calendarId, event.calendarId))
        .limit(1);

      if (!syncRow) {
        logger.warn(`No sync state found for calendarId=${event.calendarId}, skipping event ${event.id}`);
        continue;
      }

      // Resolve Slack user ID (lookup + cache)
      const slackUserId = await resolveSlackUserId(syncRow.userId, syncRow.userEmail);
      if (!slackUserId) {
        logger.warn(
          `Could not resolve Slack user for ${syncRow.userName} (${syncRow.userEmail}), skipping event ${event.id}`
        );
        continue;
      }

      const attendees = (event.attendees ?? []) as Array<{
        email: string;
        responseStatus?: string;
      }>;

      // Attempt to build a rich briefing for events with linked accounts
      const briefing = await gatherMeetingBriefing(event.id, {
        summary: event.summary,
        startTime: event.startTime,
        htmlLink: event.htmlLink,
        attendees,
      });

      try {
        if (briefing) {
          // Generate AI talking points — wrapped in try/catch so failure doesn't block notification
          let talkingPoints: string[] | null = null;
          try {
            talkingPoints = await generateTalkingPoints(briefing);
            logger.info(`Generated ${talkingPoints.length} talking points for event ${event.id}`);
          } catch (aiErr) {
            logger.warn(`AI talking points generation failed for event ${event.id}, sending briefing without them`, {
              error: aiErr instanceof Error ? aiErr.message : String(aiErr),
            });
          }

          const { text, blocks } = buildBriefingSlackBlocks(briefing, talkingPoints);
          await sendSlackDM(slackUserId, text, blocks);
          briefings++;
        } else {
          // Fallback: simple notification for events without linked accounts
          const { text, blocks } = buildSimpleNotification(event, attendees);
          await sendSlackDM(slackUserId, text, blocks);
        }

        // Mark as notified to prevent duplicates
        await db.update(calendarEvents).set({ notifiedAt: new Date() }).where(eq(calendarEvents.id, event.id));

        notified++;
      } catch (err) {
        logger.error(`Failed to send Slack DM for event ${event.id} to ${syncRow.userName}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(
      `Sent ${notified} Slack DM notifications (${briefings} with briefings) out of ${upcomingEvents.length} upcoming events`,
    );

    return { notified, total: upcomingEvents.length, briefings };
  },
});

// ---------------------------------------------------------------------------
// Simple fallback notification (original format for events with no linked accounts)
// ---------------------------------------------------------------------------

function buildSimpleNotification(
  event: {
    summary: string | null;
    startTime: Date;
    location: string | null;
    htmlLink: string | null;
    description: string | null;
  },
  attendees: Array<{ email: string; responseStatus?: string }>,
): { text: string; blocks: Record<string, unknown>[] } {
  const startTimeStr = event.startTime.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  const descriptionSnippet = event.description
    ? event.description.length > 150
      ? event.description.slice(0, 150) + "…"
      : event.description
    : null;

  const textLines = [
    `:calendar: *Upcoming Meeting in ~30 minutes*`,
    `*Title:* ${event.summary || "(No title)"}`,
    `*Time:* ${startTimeStr} UK`,
    event.location ? `*Location:* ${event.location}` : null,
    event.htmlLink ? `<${event.htmlLink}|Open in Calendar>` : null,
    descriptionSnippet ? `` : null,
    descriptionSnippet ? `*Description:*` : null,
    descriptionSnippet ? descriptionSnippet : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const fallbackText = `Upcoming meeting: ${event.summary || "(No title)"} at ${startTimeStr}`;

  return {
    text: fallbackText,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: textLines } }],
  };
}
