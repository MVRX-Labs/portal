import { createId } from "@paralleldrive/cuid2";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const PREFIXES = {
  user: "user",
  acct: "acct",
  contact: "contact",
  run: "run",
  lead: "lead",
  calevent: "calevent",
  calsync: "calsync",
  calevtacct: "calevtacct",
  calevtcont: "calevtcont",
  action: "action",
  engprof: "engprof",
  engpost: "engpost",
  engjob: "engjob",
  engraw: "engraw",
  mprof: "mprof",
  mpost: "mpost",
  arpt: "arpt",
} as const;

type Prefix = (typeof PREFIXES)[keyof typeof PREFIXES];

export type UserId = `user_${string}`;
export type AccountId = `acct_${string}`;
export type ContactId = `contact_${string}`;
export type RunId = `run_${string}`;
export type LeadId = `lead_${string}`;
export type CalendarEventId = `calevent_${string}`;
export type CalendarSyncId = `calsync_${string}`;
export type CalendarEventAccountId = `calevtacct_${string}`;
export type CalendarEventContactId = `calevtcont_${string}`;
export type ActionId = `action_${string}`;
export type EngagementProfileId = `engprof_${string}`;
export type EngagementPostId = `engpost_${string}`;
export type EngagementJobId = `engjob_${string}`;
export type EngagementRawResultId = `engraw_${string}`;
export type ManagedProfileId = `mprof_${string}`;
export type ManagedPostId = `mpost_${string}`;
export type AnalyticsReportId = `arpt_${string}`;
export type ObjectId =
  | UserId
  | AccountId
  | ContactId
  | RunId
  | LeadId
  | CalendarEventId
  | CalendarSyncId
  | CalendarEventAccountId
  | CalendarEventContactId
  | ActionId
  | EngagementProfileId
  | EngagementPostId
  | EngagementJobId
  | EngagementRawResultId
  | ManagedProfileId
  | ManagedPostId
  | AnalyticsReportId;

type PrefixToId = {
  user: UserId;
  acct: AccountId;
  contact: ContactId;
  run: RunId;
  lead: LeadId;
  calevent: CalendarEventId;
  calsync: CalendarSyncId;
  calevtacct: CalendarEventAccountId;
  calevtcont: CalendarEventContactId;
  action: ActionId;
  engprof: EngagementProfileId;
  engpost: EngagementPostId;
  engjob: EngagementJobId;
  engraw: EngagementRawResultId;
  mprof: ManagedProfileId;
  mpost: ManagedPostId;
  arpt: AnalyticsReportId;
};

export function createObjectId<P extends Prefix>(prefix: P): PrefixToId[P] {
  return `${prefix}_${createId()}` as PrefixToId[P];
}

export function isObjectId<P extends Prefix>(value: string, prefix: P): value is PrefixToId[P] {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

export function assertObjectId<P extends Prefix>(value: string, prefix: P): PrefixToId[P] {
  if (!isObjectId(value, prefix)) {
    throw new Error(`Invalid ${prefix} ID: expected "${prefix}_..." but got "${value}"`);
  }
  return value;
}

export function prefixForTable(table: string): Prefix {
  const map: Record<string, Prefix> = {
    users: "user",
    accounts: "acct",
    contacts: "contact",
    tool_runs: "run",
    leads: "lead",
    calendar_events: "calevent",
    calendar_sync_state: "calsync",
    calendar_event_accounts: "calevtacct",
    calendar_event_contacts: "calevtcont",
    account_actions: "action",
    engagement_profiles: "engprof",
    engagement_posts: "engpost",
    engagement_jobs: "engjob",
    engagement_raw_results: "engraw",
    managed_profiles: "mprof",
    managed_posts: "mpost",
    analytics_reports: "arpt",
  };
  const prefix = map[table];
  if (!prefix) throw new Error(`No prefix defined for table: ${table}`);
  return prefix;
}
