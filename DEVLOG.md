# DEVLOG — Good Soil Harvest

Newest entries at top. See CLAUDE.md rule #3 for format (or the convention in `~/.claude/projects/-Users-chris/memory/convention_repo_coordination.md`).

---

## 2026-05-22 — sentinel — fix #1309: weekly cleanup cron route

- Added `src/app/api/cron/cleanup/route.ts` mirroring the `notifications/digest` shape (POST, `AGENT_API_SECRET`-gated). Batched (≤1000/pass) deletes for expired sessions, stale `RateLimit` rows (>30d), and orphan `AffiliateLink`s. `PushSubscription` cleanup intentionally skipped — no `last_contacted` column yet (note in route header).
- Schedule the endpoint weekly from launchd alongside the existing digest cron; no infra/wrangler/workflow files touched.
- Lane: 2 (awaiting Chris — no test suite, new endpoint needs scheduling)
- PR: see Sentinel fix queue

---

## 2026-05-18 — chris-cc — bootstrap DEVLOG.md

- Created this `DEVLOG.md`. CLAUDE.md already existed in this repo (last touched 2026-04-05); not modified.
- No code changes.
- Captures current state: GSH is fully on LLC CF (zone moved + worker + D1 + R2 all live on LLC as of 2026-05-11/2026-05-17), Personal-account leftovers all deleted, apex serves HTTP 200 via the LLC `goodsoilharvest` worker.

### NEXT

- Sentinel currently flags 9 Next.js advisories on this repo (`#771, #776, #778, #779, #773, #775, #777, #780, #772, #774` — mix of high/medium/low) — part of the org-wide Next.js wave (17 findings across GSH + Openclaw-Maximus). Auto-fix PRs are queued; will dispatch once GH Actions cap resets 2026-06-01.
- Daily Good Soil blog cron continues to run nightly (~03:00). The `cf-pages-migration` branch is stale (0 ahead / 17 behind main) — abandon it during cleanup per MASTER-TODO.
