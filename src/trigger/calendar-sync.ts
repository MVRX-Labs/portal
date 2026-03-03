import { schedules, logger, metadata } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  contacts,
  calendarSyncState,
  calendarEvents,
  calendarEventAccounts,
  calendarEventContacts,
} from "@/lib/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import {
  fullCalendarSync,
  incrementalCalendarSync,
  getExternalAttendees,
  hasExternalAttendees,
  SyncTokenExpiredError,
  type CalendarEvent,
} from "@/lib/gcalendar";
import { matchOrCreateForAttendee } from "@/lib/calendar-matching";
import { sendSlackNotification } from "@/lib/slack";
import { accountEnrichmentTask } from "./account-enrichment";

export const calendarSyncTask = schedules.task({
  id: "calendar-sync",
  cron: {
    pattern: "*/30 7-22 * * *",
    timezone: "Europe/London",
  },
  maxDuration: 600,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
  },
  run: async () => {
    logger.info("Starting calendar sync");

    const now = new Date();

    // Rotate stale nextMeetingAt -> lastMeetingAt for meetings that have passed
    await db
      .update(accounts)
      .set({ lastMeetingAt: accounts.nextMeetingAt, nextMeetingAt: null, updatedAt: now })
      .where(and(isNotNull(accounts.nextMeetingAt), lt(accounts.nextMeetingAt, now)));

    await db
      .update(contacts)
      .set({ lastMeetingAt: contacts.nextMeetingAt, nextMeetingAt: null, updatedAt: now })
      .where(and(isNotNull(contacts.nextMeetingAt), lt(contacts.nextMeetingAt, now)));

    const allUsers = await db.select().from(users);
    logger.info(`Found ${allUsers.length} users to sync calendars for`);

    let totalEventsProcessed = 0;
    let totalNewEvents = 0;
    let totalErrors = 0;
    let totalEnrichmentTriggered = 0;

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const calendarId = user.email;

      metadata.set("progress", {
        step: `Syncing calendar for ${user.name}`,
        stepNumber: i + 1,
        totalSteps: allUsers.length,
        percentage: Math.round((100 * i) / allUsers.length),
      });

      try {
        // Get or create sync state
        let [syncState] = await db
          .select()
          .from(calendarSyncState)
          .where(
            and(
              eq(calendarSyncState.userId, user.id),
              eq(calendarSyncState.calendarId, calendarId),
            ),
          )
          .limit(1);

        if (!syncState) {
          [syncState] = await db
            .insert(calendarSyncState)
            .values({ userId: user.id, calendarId })
            .returning();
        }

        // Sync: full or incremental
        let events: CalendarEvent[];
        let newSyncToken: string;

        if (syncState.syncToken) {
          try {
            const result = await incrementalCalendarSync(calendarId, syncState.syncToken);
            events = result.events;
            newSyncToken = result.newSyncToken;
            logger.info(`Incremental sync for ${user.name}: ${events.length} changed events`);
          } catch (err) {
            if (err instanceof SyncTokenExpiredError) {
              logger.warn(`Sync token expired for ${user.name}, doing full sync`);
              const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
              const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
              const result = await fullCalendarSync(calendarId, timeMin, timeMax);
              events = result.events;
              newSyncToken = result.syncToken;
            } else {
              throw err;
            }
          }
        } else {
          // First sync: -7 days to +7 days
          const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const result = await fullCalendarSync(calendarId, timeMin, timeMax);
          events = result.events;
          newSyncToken = result.syncToken;
          logger.info(`Full sync for ${user.name}: ${events.length} events`);
        }

        // Process events
        for (const event of events) {
          totalEventsProcessed++;

          // Handle cancelled events
          if (event.status === "cancelled") {
            await db
              .update(calendarEvents)
              .set({ status: "cancelled", updatedAt: new Date() })
              .where(
                and(
                  eq(calendarEvents.googleEventId, event.id),
                  eq(calendarEvents.calendarId, calendarId),
                ),
              );
            continue;
          }

          // Skip events without external attendees
          if (!hasExternalAttendees(event)) continue;

          const startTime = new Date(event.start.dateTime || event.start.date || "");
          const endTime = new Date(event.end.dateTime || event.end.date || "");
          if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) continue;

          // Upsert the event
          const [upsertedEvent] = await db
            .insert(calendarEvents)
            .values({
              googleEventId: event.id,
              calendarId,
              summary: event.summary || null,
              description: event.description || null,
              startTime,
              endTime,
              location: event.location || null,
              organizerEmail: event.organizer?.email || null,
              status: event.status,
              attendees: event.attendees || [],
              isRecurring: !!event.recurringEventId,
              recurringEventId: event.recurringEventId || null,
              htmlLink: event.htmlLink || null,
            })
            .onConflictDoUpdate({
              target: [calendarEvents.calendarId, calendarEvents.googleEventId],
              set: {
                summary: event.summary || null,
                description: event.description || null,
                startTime,
                endTime,
                location: event.location || null,
                organizerEmail: event.organizer?.email || null,
                status: event.status,
                attendees: event.attendees || [],
                htmlLink: event.htmlLink || null,
                updatedAt: new Date(),
              },
            })
            .returning();

          totalNewEvents++;

          // Match external attendees to accounts/contacts
          const externalAttendees = getExternalAttendees(event);
          const matchedAccountIds = new Set<string>();
          const matchedContactIds = new Set<string>();

          for (const attendee of externalAttendees) {
            try {
              const match = await matchOrCreateForAttendee(
                attendee.email,
                attendee.displayName,
              );

              // null = personal email (gmail, etc.) — skip
              if (!match) continue;

              if (!matchedAccountIds.has(match.accountId)) {
                await db
                  .insert(calendarEventAccounts)
                  .values({
                    eventId: upsertedEvent.id,
                    accountId: match.accountId,
                    matchConfidence: match.accountMatchConfidence,
                    matchedVia: match.accountMatchedVia,
                  })
                  .onConflictDoNothing();
                matchedAccountIds.add(match.accountId);
              }

              if (!matchedContactIds.has(match.contactId)) {
                await db
                  .insert(calendarEventContacts)
                  .values({
                    eventId: upsertedEvent.id,
                    contactId: match.contactId,
                    attendeeEmail: attendee.email,
                    matchConfidence: match.contactMatchConfidence,
                    matchedVia: match.contactMatchedVia,
                  })
                  .onConflictDoNothing();
                matchedContactIds.add(match.contactId);
              }

              // Trigger enrichment for newly auto-created accounts
              if (match.newAccountDomain) {
                await accountEnrichmentTask.trigger({
                  accountId: match.accountId,
                  domain: match.newAccountDomain,
                });
                totalEnrichmentTriggered++;
                logger.info(
                  `Triggered enrichment for new account ${match.accountId} (domain: ${match.newAccountDomain})`,
                );
              }
            } catch (matchErr) {
              logger.warn(`Failed to match attendee ${attendee.email}`, {
                error: matchErr instanceof Error ? matchErr.message : String(matchErr),
              });
            }
          }

          // Update next/last meeting timestamps
          for (const accountId of matchedAccountIds) {
            await updateAccountMeetingTimestamps(accountId, startTime, now);
          }
          for (const contactId of matchedContactIds) {
            await updateContactMeetingTimestamps(contactId, startTime, now);
          }
        }

        // Update sync state
        await db
          .update(calendarSyncState)
          .set({
            syncToken: newSyncToken,
            lastSyncedAt: new Date(),
            lastSyncError: null,
            updatedAt: new Date(),
          })
          .where(eq(calendarSyncState.id, syncState.id));
      } catch (err) {
        totalErrors++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Calendar sync failed for ${user.name}: ${errorMessage}`);

        // Record error in sync state
        await db
          .update(calendarSyncState)
          .set({ lastSyncError: errorMessage, updatedAt: new Date() })
          .where(
            and(
              eq(calendarSyncState.userId, user.id),
              eq(calendarSyncState.calendarId, calendarId),
            ),
          );

        sendSlackNotification({
          tool: "calendar-sync",
          userName: user.name,
          error: errorMessage,
          runId: "calendar-sync",
        }).catch(() => {});
      }
    }

    metadata.set("progress", {
      step: "Complete",
      stepNumber: allUsers.length,
      totalSteps: allUsers.length,
      percentage: 100,
    });

    logger.info(
      `Calendar sync complete: ${allUsers.length} users, ${totalEventsProcessed} events processed, ${totalNewEvents} upserted, ${totalEnrichmentTriggered} enrichments triggered, ${totalErrors} errors`,
    );

    return {
      usersProcessed: allUsers.length,
      eventsProcessed: totalEventsProcessed,
      newEvents: totalNewEvents,
      enrichmentTriggered: totalEnrichmentTriggered,
      errors: totalErrors,
    };
  },
});

async function updateAccountMeetingTimestamps(
  accountId: string,
  eventStartTime: Date,
  now: Date,
) {
  const [acct] = await db
    .select({ nextMeetingAt: accounts.nextMeetingAt, lastMeetingAt: accounts.lastMeetingAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));

  if (!acct) return;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (eventStartTime > now) {
    if (!acct.nextMeetingAt || eventStartTime < acct.nextMeetingAt) {
      updates.nextMeetingAt = eventStartTime;
    }
  } else {
    if (!acct.lastMeetingAt || eventStartTime > acct.lastMeetingAt) {
      updates.lastMeetingAt = eventStartTime;
    }
  }

  if (Object.keys(updates).length > 1) {
    await db.update(accounts).set(updates).where(eq(accounts.id, accountId));
  }
}

async function updateContactMeetingTimestamps(
  contactId: string,
  eventStartTime: Date,
  now: Date,
) {
  const [cont] = await db
    .select({ nextMeetingAt: contacts.nextMeetingAt, lastMeetingAt: contacts.lastMeetingAt })
    .from(contacts)
    .where(eq(contacts.id, contactId));

  if (!cont) return;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (eventStartTime > now) {
    if (!cont.nextMeetingAt || eventStartTime < cont.nextMeetingAt) {
      updates.nextMeetingAt = eventStartTime;
    }
  } else {
    if (!cont.lastMeetingAt || eventStartTime > cont.lastMeetingAt) {
      updates.lastMeetingAt = eventStartTime;
    }
  }

  if (Object.keys(updates).length > 1) {
    await db.update(contacts).set(updates).where(eq(contacts.id, contactId));
  }
}
