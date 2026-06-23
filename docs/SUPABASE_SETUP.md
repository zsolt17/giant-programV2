# Step 1 — Supabase project + schema + auth

Goal of this step (and nothing more): the project exists, the schema is created,
RLS is on, single-user login works, and one row round-trips. We verify, then move
to Step 2 (`repository.js`).

## 1. Create the project
1. Go to https://supabase.com → sign in → **New project**.
2. Name it (e.g. `giant-program`), pick a region close to you (Frankfurt/EU is
   closest to Brașov), set a strong database password (save it).
3. Wait for it to provision (~2 min).

## 2. Grab your keys (you'll need these in Step 2)
Project Settings → **API**:
- **Project URL** — `https://xxxxx.supabase.co`
- **anon public** key — the client-side key the app will use.

Paste them here when you have them (don't share the `service_role` key):
- Project URL: `https://sjhhuypiqoyznhxittkl.supabase.co`
- anon key:    `sb_publishable_N-SQBP39CFLiRsYaKNPu5Q_T50zfwTR`

## 3. Create your single user
Authentication → **Users** → **Add user** → **Create new user**:
- Email: your email
- Password: pick one
- ✅ **Auto Confirm User** (so you can log in immediately)

Then copy that user's **UID** (click the user row) — you'll paste it into the
verification step below.
- My user UID: `cc328bda-1c4b-4da4-8ed1-a2f1456a7c53`

> We use email/password for the single account. No public sign-up; RLS ties every
> row to this UID.

## 4. Run the schema migration
SQL Editor → **New query** → paste the entire contents of
`supabase/migrations/0001_init.sql` → **Run**. It should finish with no errors.

## 5. Verify (this is the gate for Step 1)
Run each block in the SQL Editor and check the result.

**a) All 7 tables exist with RLS enabled:**
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```
Expect 7 rows — `accessory_weights, break_days, deloads, macros, sessions,
testing_results, working_weights` — all with `rowsecurity = true`.

**b) Seed the real Macro 2 row and read it back.**
The SQL editor runs as `postgres` (bypasses RLS), so set `user_id` explicitly to
your UID from step 3:
```sql
insert into macros (user_id, number, start_date, status)
values ('PASTE-YOUR-UID-HERE', 2, '2026-04-13', 'active')
returning *;
```
Expect one row back with `number = 2`, `start_date = 2026-04-13`, a generated `id`.

**c) Prove the per-cycle relation works** (one sample weight row; real weights get
entered properly in Step 4's Setup UI):
```sql
insert into working_weights (macro_id, cycle, lift, hard, medium, light)
select id, 1, 'deadlift', 160, 150, 145 from macros where number = 2
returning *;

select m.number, w.cycle, w.lift, w.hard, w.medium, w.light
from working_weights w join macros m on m.id = w.macro_id;
```
Expect the joined row: `2 | 1 | deadlift | 160 | 150 | 145`. (Delete it later if
you want a clean slate before Step 4 — `delete from working_weights;`)

## When done
Tell me: keys collected, migration ran clean, and the three verify blocks
returned what's expected. Then we start Step 2 — `repository.js` + `mappers.js`,
tested against this database before any UI.
