# Database migrations — runbook

How the Supabase schema is changed and kept reproducible. The schema is the
canonical source of truth for the backend; these files **are** that schema's
history. Read this before touching the database.

## Where things stand

- Migrations live in `supabase/migrations/`, numbered `000N_name.sql`, **forward-only**.
- `0001_init.sql` and `0002_session_timer.sql` were applied **by hand** (pasted into
  the Supabase SQL editor). No CLI, no migration-history tracking yet — so the live
  DB currently matches these files only because nothing else was changed by hand.
- `0003_hardening.sql` was applied by hand too, then the CLI was adopted: the project is
  **linked** (`supabase link`), the hand-applied history was **reconciled**
  (`migration repair --status applied 0001 0002 0003`), and `supabase init` generated the
  committed `config.toml`. From here, all schema changes go through the CLI (below).

The goal of this runbook: stop hand-pasting, so the database can always be rebuilt
from these files and can never silently drift from them.

## Conventions (keep doing these)

- **Forward-only & immutable.** Never edit a migration that's already been applied —
  add a new numbered file instead. The files are an append-only ledger.
- **Idempotent where practical.** Prefer `if not exists` / `drop ... if exists` then
  `add`, so re-running a file is safe (see `0003` for the pattern).
- **One change, one file**, applied as part of the same commit as the code that needs
  it (mirrors `CONVENTIONS.md` §8).
- **Never destructive without a backup** (see Backups below). Dropping a column or
  table is irreversible against real data.

## One-time CLI setup (do this once)

> **Run every `supabase` command from the repo root** (the folder that contains
> `supabase/migrations/`). The CLI resolves migrations relative to the current
> directory — running from elsewhere gives `glob supabase/migrations/0001_*.sql: file
> does not exist` and an empty migration list.

```bash
# 1. Install the CLI
brew install supabase/tap/supabase

# 2. Authenticate
supabase login

# 3. Link this repo to your project. You'll be asked for the database password
#    (Project Settings -> Database). The ref below is this project's.
supabase link --project-ref sjhhuypiqoyznhxittkl
```

### Reconcile the hand-applied history

`0001`–`0003` were all applied by hand, so the remote **has** the objects but no
migration-history rows — the CLI doesn't know they're applied. **Mark them applied** so
it won't try to re-run them, keeping the readable `000N` files as the ledger:

```bash
supabase migration list                                  # local files vs remote (remote empty)
supabase migration repair --status applied 0001 0002 0003
supabase migration list                                  # all three now applied on both sides
```

Future migrations from `supabase migration new` use a 14-digit timestamp prefix; that's
fine — `0001` sorts before `2026…`, so ordering holds. (Fallback if the CLI ever balks at
the mixed naming: `supabase db pull` writes a single baseline of the current remote schema
and marks it applied — then keep `0001`–`0003` purely as historical record.)

> Linking and the reconcile step are **interactive and need your DB password**, so run
> them yourself — they aren't scripted here. Paste the final `migration list` output back
> and I'll confirm it's reconciled.

## Day-to-day workflow (after setup)

```bash
supabase migration new <short_name>      # creates supabase/migrations/<ts>_<short_name>.sql
#   ...edit the generated file...
supabase db push                         # applies pending migrations to the linked project
```

That's it — the file is written once, applied the same way every time, and the
history table records it. **No more pasting into the dashboard.**

To verify a file before pushing, you can run the whole stack locally
(`supabase start` → local Postgres) and `supabase db reset` to rebuild from scratch —
the ultimate proof the migrations are reproducible.

## Applying `0003_hardening.sql`

- **With the CLI (preferred):** once linked + reconciled, `supabase db push` applies it.
- **By hand (bridge option, until the CLI is set up):** paste `0003_hardening.sql` into
  the SQL editor and run it. It's idempotent and adds the CHECKs `NOT VALID`, so it
  won't fail on any legacy row. Do a backup first (below).

## Backups

The schema is reproducible from these files, but the **data** is not — years of
training history is irreplaceable. Free-tier automatic backups are thin, so keep your
own. **Run a backup before any destructive migration** (column/table drop). Three options:

**Easiest — `supabase db dump` (needs Docker):**
```bash
supabase db dump --data-only -f giant_data_$(date +%F).sql   # the irreplaceable data
supabase db dump            -f giant_schema_$(date +%F).sql   # schema (also in these files)
```
Docker on this machine is provided by **Colima** (not Docker Desktop), installed via
`brew install colima docker` and set to auto-start at login (`brew services start colima`).
If `db dump` errors with *"Cannot connect to the Docker daemon"*, run `colima start`.

**Raw `pg_dump`** (no Docker, needs the dashboard connection string — Project Settings → Database):
```bash
pg_dump "<connection-string>" --no-owner --no-privileges -f giant_backup_$(date +%F).sql
```

**No-Docker, no-connection-string fallback** (used for `0005`): a small authenticated **JSON
export** of every table via the app's Supabase credentials (`SMOKE_EMAIL`/`PASSWORD` from
`.env.local`) — a short script that signs in and `select('*')`s each table to a JSON file.
Proportionate when a migration only touches one table.

Note: `supabase db push` / `migration list` connect directly and **don't** need Docker — only
`db dump` and the local stack (`supabase start`) do. Restoring a SQL dump is
`psql "<connection-string>" -f giant_backup_YYYY-MM-DD.sql`.

## Related

- `ARCHITECTURE.md` §9 — the schema and the *why* behind it.
- `CONVENTIONS.md` §8 — how to thread a schema change through the codebase
  (migration → mapper → repository → state → UI).
