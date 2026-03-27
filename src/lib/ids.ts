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
  msnap: "msnap",
  arpt: "arpt",
  kchan: "kchan",
  ksync: "ksync",
  kevt: "kevt",
  kunit: "kunit",
  kstate: "kstate",
  sectype: "sectype",
  secret: "secret",
  lprof: "lprof",
  lpost: "lpost",
  lsnap: "lsnap",
  lsync: "lsync",
  lcomm: "lcomm",
  leng: "leng",
  lcsv: "lcsv",
  acache: "acache",
  icp: "icp",
  afeed: "afeed",
  tprof: "tprof",
  tpost: "tpost",
  tsnap: "tsnap",
  tsync: "tsync",
  trepl: "trepl",
  teng: "teng",
  tafeed: "tafeed",
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
export type ManagedPostSnapshotId = `msnap_${string}`;
export type AnalyticsReportId = `arpt_${string}`;
export type KnowledgeChannelId = `kchan_${string}`;
export type KnowledgeSyncId = `ksync_${string}`;
export type KnowledgeEventId = `kevt_${string}`;
export type KnowledgeUnitId = `kunit_${string}`;
export type KnowledgeStateId = `kstate_${string}`;
export type SecretTypeId = `sectype_${string}`;
export type SecretId = `secret_${string}`;
export type LinkedinProfileId = `lprof_${string}`;
export type LinkedinPostId = `lpost_${string}`;
export type LinkedinPostSnapshotId = `lsnap_${string}`;
export type LinkedinSyncRunId = `lsync_${string}`;
export type LinkedinPostCommentId = `lcomm_${string}`;
export type LinkedinPostEngagementId = `leng_${string}`;
export type LeadCsvId = `lcsv_${string}`;
export type ApifyCacheId = `acache_${string}`;
export type IcpDefinitionId = `icp_${string}`;
export type AlphaFeedId = `afeed_${string}`;
export type TwitterProfileId = `tprof_${string}`;
export type TwitterPostId = `tpost_${string}`;
export type TwitterPostSnapshotId = `tsnap_${string}`;
export type TwitterSyncRunId = `tsync_${string}`;
export type TwitterPostReplyId = `trepl_${string}`;
export type TwitterPostEngagementId = `teng_${string}`;
export type TwitterAlphaFeedId = `tafeed_${string}`;
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
  | ManagedPostSnapshotId
  | AnalyticsReportId
  | KnowledgeChannelId
  | KnowledgeSyncId
  | KnowledgeEventId
  | KnowledgeUnitId
  | KnowledgeStateId
  | SecretTypeId
  | SecretId
  | LinkedinProfileId
  | LinkedinPostId
  | LinkedinPostSnapshotId
  | LinkedinSyncRunId
  | LinkedinPostCommentId
  | LinkedinPostEngagementId
  | LeadCsvId
  | ApifyCacheId
  | IcpDefinitionId
  | AlphaFeedId
  | TwitterProfileId
  | TwitterPostId
  | TwitterPostSnapshotId
  | TwitterSyncRunId
  | TwitterPostReplyId
  | TwitterPostEngagementId
  | TwitterAlphaFeedId;

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
  msnap: ManagedPostSnapshotId;
  arpt: AnalyticsReportId;
  kchan: KnowledgeChannelId;
  ksync: KnowledgeSyncId;
  kevt: KnowledgeEventId;
  kunit: KnowledgeUnitId;
  kstate: KnowledgeStateId;
  sectype: SecretTypeId;
  secret: SecretId;
  lprof: LinkedinProfileId;
  lpost: LinkedinPostId;
  lsnap: LinkedinPostSnapshotId;
  lsync: LinkedinSyncRunId;
  lcomm: LinkedinPostCommentId;
  leng: LinkedinPostEngagementId;
  lcsv: LeadCsvId;
  acache: ApifyCacheId;
  icp: IcpDefinitionId;
  afeed: AlphaFeedId;
  tprof: TwitterProfileId;
  tpost: TwitterPostId;
  tsnap: TwitterPostSnapshotId;
  tsync: TwitterSyncRunId;
  trepl: TwitterPostReplyId;
  teng: TwitterPostEngagementId;
  tafeed: TwitterAlphaFeedId;
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
    managed_post_snapshots: "msnap",
    analytics_reports: "arpt",
    knowledge_channels: "kchan",
    knowledge_sync_state: "ksync",
    knowledge_events: "kevt",
    knowledge_units: "kunit",
    knowledge_state: "kstate",
    secret_types: "sectype",
    secrets: "secret",
    linkedin_profiles: "lprof",
    linkedin_posts: "lpost",
    linkedin_post_snapshots: "lsnap",
    linkedin_sync_runs: "lsync",
    linkedin_post_comments: "lcomm",
    linkedin_post_engagements: "leng",
    lead_csvs: "lcsv",
    apify_cache: "acache",
    icp_definitions: "icp",
    alpha_feeds: "afeed",
    twitter_profiles: "tprof",
    twitter_posts: "tpost",
    twitter_post_snapshots: "tsnap",
    twitter_sync_runs: "tsync",
    twitter_post_replies: "trepl",
    twitter_post_engagements: "teng",
    twitter_alpha_feeds: "tafeed",
  };
  const prefix = map[table];
  if (!prefix) throw new Error(`No prefix defined for table: ${table}`);
  return prefix;
}
