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
} as const;

type Prefix = (typeof PREFIXES)[keyof typeof PREFIXES];

export type UserId = `user_${string}`;
export type AccountId = `acct_${string}`;
export type ContactId = `contact_${string}`;
export type RunId = `run_${string}`;
export type ObjectId = UserId | AccountId | ContactId | RunId;

type PrefixToId = {
  user: UserId;
  acct: AccountId;
  contact: ContactId;
  run: RunId;
};

export function createObjectId<P extends Prefix>(prefix: P): PrefixToId[P] {
  return `${prefix}_${createId()}` as PrefixToId[P];
}

export function isObjectId<P extends Prefix>(
  value: string,
  prefix: P
): value is PrefixToId[P] {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

export function assertObjectId<P extends Prefix>(
  value: string,
  prefix: P
): PrefixToId[P] {
  if (!isObjectId(value, prefix)) {
    throw new Error(
      `Invalid ${prefix} ID: expected "${prefix}_..." but got "${value}"`
    );
  }
  return value;
}

export function prefixForTable(table: string): Prefix {
  const map: Record<string, Prefix> = {
    users: "user",
    accounts: "acct",
    contacts: "contact",
    tool_runs: "run",
  };
  const prefix = map[table];
  if (!prefix) throw new Error(`No prefix defined for table: ${table}`);
  return prefix;
}
