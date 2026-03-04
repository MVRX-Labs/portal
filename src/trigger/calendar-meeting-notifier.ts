import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  calendarSyncState,
  accounts,
  contacts,
  users,
} from "@/lib/schema";
import { eq, and, gte, lt, isNull } from "drizzle-orm";
import { resolveSlackUserId, sendSlackDM } from "@/lib/slack";

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
      return { notified: 0, total: 0 };
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

      // Get linked accounts
      const linkedAccounts = await db
        .select({
          accountName: accounts.name,
          matchConfidence: calendarEventAccounts.matchConfidence,
        })
        .from(calendarEventAccounts)
        .innerJoin(accounts, eq(calendarEventAccounts.accountId, accounts.id))
        .where(eq(calendarEventAccounts.eventId, event.id));

      // Get linked contacts
      const linkedContacts = await db
        .select({
          contactName: contacts.name,
          attendeeEmail: calendarEventContacts.attendeeEmail,
          matchConfidence: calendarEventContacts.matchConfidence,
        })
        .from(calendarEventContacts)
        .innerJoin(contacts, eq(calendarEventContacts.contactId, contacts.id))
        .where(eq(calendarEventContacts.eventId, event.id));

      const startTimeStr = event.startTime.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      });

      // Build a lookup of attendee email → response status from the event's attendees JSONB
      const attendees = (event.attendees ?? []) as Array<{
        email: string;
        responseStatus?: string;
      }>;
      const responseByEmail = new Map(attendees.map((a) => [a.email.toLowerCase(), a.responseStatus]));

      const responseLabel = (status: string | undefined): string => {
        switch (status) {
          case "accepted":
            return "accepted";
          case "tentative":
            return "tentative";
          case "declined":
            return "declined";
          default:
            return "awaiting response";
        }
      };

      const accountLines = linkedAccounts.map((a) => {
        const tag = a.matchConfidence === "auto_created" ? " _(auto-created)_" : "";
        return `  • ${a.accountName}${tag}`;
      });

      const contactLines = linkedContacts.map((c) => {
        const tag = c.matchConfidence === "auto_created" ? " _(auto-created)_" : "";
        const status = responseByEmail.get(c.attendeeEmail.toLowerCase());
        return `  • ${c.contactName} (${c.attendeeEmail}) — ${responseLabel(status)}${tag}`;
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
        ``,
        accountLines.length > 0 ? `*Accounts:*` : null,
        ...(accountLines.length > 0 ? accountLines : []),
        ``,
        contactLines.length > 0 ? `*External Contacts:*` : null,
        ...(contactLines.length > 0 ? contactLines : []),
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const fallbackText = `Upcoming meeting: ${event.summary || "(No title)"} at ${startTimeStr}`;

      try {
        await sendSlackDM(slackUserId, fallbackText, [
          {
            type: "section",
            text: { type: "mrkdwn", text: textLines },
          },
        ]);

        // Mark as notified to prevent duplicates
        await db.update(calendarEvents).set({ notifiedAt: new Date() }).where(eq(calendarEvents.id, event.id));

        notified++;
      } catch (err) {
        logger.error(`Failed to send Slack DM for event ${event.id} to ${syncRow.userName}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Sent ${notified} Slack DM notifications out of ${upcomingEvents.length} upcoming events`);

    return { notified, total: upcomingEvents.length };
  },
});
