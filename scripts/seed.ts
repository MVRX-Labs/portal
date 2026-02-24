import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/lib/schema";

config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_STORAGE_URL!);
const db = drizzle(client);

async function seed() {
  console.log("Seeding database...");

  await db
    .insert(users)
    .values([
      {
        name: "Danny",
        email: "danny@mvrxlabs.com",
        password: "admin",
        isAdmin: true,
      },
      {
        name: "Nitanshu",
        email: "nitanshu@mvrxlabs.com",
        password: "admin",
        isAdmin: true,
      },
    ])
    .onConflictDoNothing();

  console.log("Seeded 2 admin users (danny@, nitanshu@) with password: admin");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
