import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
  accounts,
  contacts,
} from "@/lib/schema";
import { eq, and, gte, lt, isNull } from "drizzle-orm";

export const calendarMeetingNotifier = schedules.task({
  id: "calendar-meeting-notifier",
  cron: {
    pattern: "*/30 7-22 * * *",
    timezone: "Europe/London",
  },
  maxDuration: 120,
  retry: {
    maxAttempts: 1,
  },
  run: async () => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.warn("SLACK_WEBHOOK_URL not configured, skipping");
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
          isNull(calendarEvents.notifiedAt),
        ),
      );

    logger.info(`Found ${upcomingEvents.length} upcoming meetings to notify about`);

    let notified = 0;

    for (const event of upcomingEvents) {
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

      const accountLines = linkedAccounts.map((a) => {
        const tag = a.matchConfidence === "auto_created" ? " _(auto-created)_" : "";
        return `  - ${a.accountName}${tag}`;
      });

      const contactLines = linkedContacts.map((c) => {
        const tag = c.matchConfidence === "auto_created" ? " _(auto-created)_" : "";
        return `  - ${c.contactName} (${c.attendeeEmail})${tag}`;
      });

      const textLines = [
        `:calendar: *Upcoming Meeting in ~30 minutes*`,
        `*Title:* ${event.summary || "(No title)"}`,
        `*Time:* ${startTimeStr} UK`,
        event.location ? `*Location:* ${event.location}` : null,
        event.htmlLink ? `<${event.htmlLink}|Open in Calendar>` : null,
        ``,
        accountLines.length > 0 ? `*Accounts:*` : null,
        ...(accountLines.length > 0 ? accountLines : []),
        ``,
        contactLines.length > 0 ? `*External Contacts:*` : null,
        ...(contactLines.length > 0 ? contactLines : []),
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Upcoming meeting: ${event.summary || "(No title)"} at ${startTimeStr}`,
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: textLines },
              },
            ],
          }),
        });

        // Mark as notified to prevent duplicates
        await db
          .update(calendarEvents)
          .set({ notifiedAt: new Date() })
          .where(eq(calendarEvents.id, event.id));

        notified++;
      } catch (err) {
        logger.error(`Failed to send Slack notification for event ${event.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Sent ${notified} Slack notifications out of ${upcomingEvents.length} upcoming events`);

    return { notified, total: upcomingEvents.length };
  },
});
