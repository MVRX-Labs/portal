# Database Migrations

This project uses [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL. There are two different workflows depending on the environment.

## Environments

| Environment | Database | Config source |
|-------------|----------|---------------|
| Local | `localhost:5432` (Docker) | `.env.local` |
| Production | Neon (pooled) | `.env.production` (pulled from Vercel) |

The Drizzle config (`drizzle.config.ts`) hardcodes `.env.local`, so all `drizzle-kit` commands target the **local** database by default.

## Local Development

### Initial setup (fresh clone)

```bash
npm run setup    # starts Docker Postgres, pushes schema, seeds data
```

This uses `drizzle-kit push` which applies the schema directly without migration files.

### Making schema changes

1. **Edit the schema** in `src/lib/schema.ts`.

2. **Generate a migration file:**
   ```bash
   npm run db:generate    # creates a new SQL file in drizzle/
   ```

3. **Apply the migration locally:**
   ```bash
   npm run db:migrate     # runs drizzle-kit migrate against local DB
   ```

   > **Note:** If the local DB was originally set up with `db:push` (no migration history), `drizzle-kit migrate` will try to replay all migrations from the start. You'll need to manually mark earlier migrations as applied — see [Troubleshooting](#troubleshooting) below.

### Alternative: skip migration files locally

For rapid iteration you can skip migration files entirely:

```bash
npm run db:push    # applies schema diff directly, no migration file needed
```

This is fine for local dev but doesn't produce a migration file for production.

## Production (Neon via Vercel)

Production uses `drizzle-kit push` to apply schema changes directly (no migration tracking).

### Steps

1. **Pull production env vars from Vercel:**
   ```bash
   npx vercel env pull .env.production --environment=production
   ```

2. **Push the schema to production:**
   ```bash
   npx drizzle-kit push --config drizzle-prod.config.ts
   ```

   Or, if you don't have a separate prod config, temporarily swap the env file:
   ```bash
   # Backup and swap
   cp .env.local .env.local.bak
   cp .env.production .env.local

   npm run db:push

   # Restore
   mv .env.local.bak .env.local
   ```

   > `drizzle-kit push` is safe — it introspects the remote schema and only applies the diff. It will show you what it plans to do before applying.

## npm scripts reference

| Script | Command | Purpose |
|--------|---------|---------|
| `db:generate` | `drizzle-kit generate` | Generate a migration SQL file from schema changes |
| `db:migrate` | `drizzle-kit migrate` | Apply pending migration files to local DB |
| `db:push` | `drizzle-kit push` | Apply schema diff directly (no migration file) |
| `db:seed` | `tsx scripts/seed.ts` | Seed the database with initial data |
| `setup` | Docker + push + seed | Full local environment setup |

## Troubleshooting

### `drizzle-kit migrate` fails with "relation already exists"

This happens when the database was originally set up with `db:push` (which doesn't record migration history), so Drizzle tries to replay old migrations.

**Fix:** Run the script to insert all migration records into prod:

```bash
npm run db:fix-prod-journal
```

This uses SHA256 hashes of each migration file and the `when` timestamps from `drizzle/meta/_journal.json`. Then re-run `npm run db:migrate` (with prod URL) to verify.

### Can't connect to local database

Make sure Docker is running:

```bash
docker compose up -d
pg_isready -h localhost -p 5432
```
