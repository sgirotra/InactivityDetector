# Fall '26 Critical Path: planner

A single-user planner for classes, deadlines, recruiting, clubs and daily focus lists. It replaces the
hardcoded `docs/reference-v1.html` tracker, and everything on the page is now editable.

Next.js (App Router) + TypeScript + Tailwind v4, Prisma on SQLite (Postgres-ready), zod, dnd-kit, vitest.

## Run it

```bash
cd planner
npm install
cp .env.example .env        # DATABASE_URL="file:./planner.db"
npm run setup               # create the database and load data/seed-data.json
npm run dev                 # http://localhost:3000
```

For daily use, run the production build instead: `npm run build && npm start`.

- `npm test` runs the date-logic tests (vitest).
- `npm run lint` type-checks the project.
- `npm run db:seed` is idempotent: original ids are kept and rows that already exist are left alone.
  `npm run db:seed -- --reset` wipes the database and reseeds it.

## Using it

- **Quick add**: press `/` or `⌘K`, then type a phrase. A preview appears as you type and every field can be edited.
  Press Enter to move to Save, and Enter again to save.
  - `3030 homework due fri` creates a task in ISYE 3030 due Friday
  - `home depot meeting tue 6:30-7:30pm` creates an event (with no end time, it assumes one hour)
  - `no school mon and tue` (also `mon-wed` or `11/25 through 11/27`) creates days off
  - `focus tomorrow: gym, math, kpmg prep` or `tomorrow's focus is …` creates a focus list
  - `finished the 10/13 GPS` or `done 3030 homework` checks off the best match
  - `skip home depot fri` cancels one occurrence of a weekly block
  - A trailing `!` (or `p1`–`p3`) sets the priority

  Relative dates are resolved in America/New_York. Between midnight and 4am, "tomorrow" means the day that
  just started, and the preview says so. Sections are matched loosely by code, name or the per-section
  "quick-add names" (edit a section to change them). A block with no section yet, such as VIP, offers to create one.
- **Check-off**: the item fades out and an Undo toast stays up for 5s. "Show completed (N)" in the header brings completed items back.
- **Edit**: click any task, event, section title or day card. A weekly block opens its day, where you can skip it once or mark the whole day off.
- **Header → Schedule**: manage weekly blocks, days off, skips, clash notes and archived sections.
- **Drag** a task by its ⋮⋮ handle to reorder it or move it to another section. Dragging is off while a search filter is active.

## Backups

- **Export** in the header downloads all data as JSON, in the same shape as `data/seed-data.json`
  plus ids, completion and ordering.
- **Import** merges a file: matching ids are updated, new ids are added, and nothing is deleted.
- `npm run backup` writes the same JSON to `./backups/` from the command line (handy for cron).
- The SQLite file itself (`prisma/planner.db`) is also a complete backup when the server is stopped.

## Layout

```
data/seed-data.json        original tracker data
prisma/schema.prisma       data model (dates are Eastern "YYYY-MM-DD" strings, times "HH:MM")
prisma/seed.ts             idempotent seed
src/lib/                   pure logic, shared by client and server
  dates.ts                 Eastern clock + calendar math
  schedule.ts              blocks per day, days off, skips, clash detection, layoutColumns
  board.ts                 slipped, due chips, counters, due next, focus visibility
  quickadd.ts, match.ts    quick-add parser + fuzzy section matching
  actions.ts               zod schema for every write
  transfer.ts              backup/seed format
src/lib/server/            Prisma access, mutation handler, importer
src/app/api/               GET state, POST mutate, GET export, POST import
src/components/            UI
tests/                     vitest suites for the date logic
```

## Hosting so it's reachable from any device

Recommended: **Vercel + Neon (or Supabase) Postgres**, both on free tiers.
1. Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma` and set `DATABASE_URL` to the Postgres URL.
2. Run `npx prisma db push && npm run db:seed` once against that database (or import an export from the app).
3. Deploy the `planner/` folder to Vercel with `DATABASE_URL` set.
4. Add auth before it goes public. The app has none. The quickest option is Vercel's password protection or
   Cloudflare Access in front of it. A `middleware.ts` that checks a Basic-Auth password from an env var also works.

Simpler alternative that keeps SQLite: run it on a small always-on box (a Fly.io machine with a volume, or a
home server) and reach it over **Tailscale**. It stays private with no auth code needed.
