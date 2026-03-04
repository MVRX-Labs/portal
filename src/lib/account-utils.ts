import { db } from "./db";
import { accounts } from "./schema";
import { eq } from "drizzle-orm";
import { slugify } from "./ids";

export async function uniqueSlug(base: string): Promise<string> {
  let candidate = slugify(base);
  if (!candidate) candidate = "account";
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.slug, slug)).limit(1);
    if (existing.length === 0) return slug;
    suffix++;
  }
}
