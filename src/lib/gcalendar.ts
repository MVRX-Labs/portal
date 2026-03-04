import { getGoogleAccessToken } from "./google-auth";

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  organizer?: { email: string; displayName?: string; self?: boolean };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
    organizer?: boolean;
  }>;
  status: string;
  recurringEventId?: string;
  htmlLink?: string;
}

interface CalendarListResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export class SyncTokenExpiredError extends Error {
  constructor(calendarEmail: string) {
    super(`Sync token expired for calendar ${calendarEmail}, need full resync`);
    this.name = "SyncTokenExpiredError";
  }
}

async function getCalendarAccessToken(impersonateEmail: string): Promise<string> {
  return getGoogleAccessToken({
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    sub: impersonateEmail,
  });
}

/**
 * Full sync: fetch events in a time window. Used on first run.
 * Returns events and the syncToken for subsequent incremental syncs.
 */
export async function fullCalendarSync(
  calendarEmail: string,
  timeMin: string,
  timeMax: string
): Promise<{ events: CalendarEvent[]; syncToken: string }> {
  const token = await getCalendarAccessToken(calendarEmail);
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let syncToken = "";

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      maxResults: "250",
      orderBy: "startTime",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Calendar API full sync error ${resp.status}: ${body}`);
    }

    const data: CalendarListResponse = await resp.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) syncToken = data.nextSyncToken;
  } while (pageToken);

  return { events: allEvents, syncToken };
}

/**
 * Incremental sync using syncToken. Returns changed events since last sync.
 * Throws SyncTokenExpiredError on 410 so the caller can fall back to full sync.
 */
export async function incrementalCalendarSync(
  calendarEmail: string,
  syncToken: string
): Promise<{ events: CalendarEvent[]; newSyncToken: string }> {
  const token = await getCalendarAccessToken(calendarEmail);
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let newSyncToken = "";

  do {
    const params = new URLSearchParams({ syncToken });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (resp.status === 410) {
      throw new SyncTokenExpiredError(calendarEmail);
    }
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Calendar API incremental sync error ${resp.status}: ${body}`);
    }

    const data: CalendarListResponse = await resp.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) newSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events: allEvents, newSyncToken };
}

const INTERNAL_DOMAIN = "mvrxlabs.com";
const IGNORED_DOMAIN_SUFFIXES = ["resource.calendar.google.com", "group.calendar.google.com"];

export function getExternalAttendees(
  event: CalendarEvent
): Array<{ email: string; displayName?: string; responseStatus?: string }> {
  if (!event.attendees || event.attendees.length === 0) return [];

  return event.attendees.filter((a) => {
    const domain = a.email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    if (domain === INTERNAL_DOMAIN) return false;
    if (IGNORED_DOMAIN_SUFFIXES.some((d) => domain.endsWith(d))) return false;
    return true;
  });
}

export function hasExternalAttendees(event: CalendarEvent): boolean {
  return getExternalAttendees(event).length > 0;
}
