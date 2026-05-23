# DEVLOG — Good Soil Harvest

Newest entries at top. See CLAUDE.md rule #3 for format (or the convention in `~/.claude/projects/-Users-chris/memory/convention_repo_coordination.md`).

---

## 2026-05-23 — sentinel — fix #1309: weekly DB cleanup cron

- New `POST /api/maintenance/cleanup` route (AGENT_API_SECRET-protected) batch-deletes expired `sessions`, `rate_limits` rows older than 30 days, and orphan `affiliate_links`. Skipped `push_subscriptions` — no `last_contacted` column yet (per finding note).
- New standalone Worker `cron-cleanup/` mirroring `cron-digest/` shape. Cron `0 14 * * MON`, deployed to AE LLC CF account via `--env llc`. Needs `wrangler secret put AGENT_API_SECRET --env llc` before first run.
- Lane: 2 (awaiting Chris) — no test suite to gate auto-merge; also wiring a brand-new cron worker so worth a human eyeball before deploy.
- PR: see commit body for link. Thanks Sentinel.

---

## 2026-05-19 — chris-cc — weekly digest moved to CF cron + GH/CF drift documented

- New standalone Worker `goodsoilharvest-cron-digest` deployed on the AE LLC CF account (account `8e97b023...`). Source lives in `./cron-digest/` (wrangler.jsonc + index.ts, ~15 lines total). Cron `0 13 * * SUN` — Sundays 13:00 UTC (≈9 AM EDT / 8 AM EST). Calls apex `https://goodsoilharvest.com/api/notifications/digest` with `Authorization: Bearer $AGENT_API_SECRET`. Observability enabled. Deploy with `cd cron-digest && wrangler deploy --env llc`.
- Disabled the launchd weekly-digest job: `com.chris.goodsoil-weekly-digest.plist` → renamed `.disabled-2026-05-19` (still in `~/Library/LaunchAgents/`, not loaded). The shell script `/Users/chris/scripts/goodsoil-weekly-digest.sh` is left in place but no longer fires. Daily blog-write launchd job (`com.chris.goodsoil-blog-write`) is unchanged — stays on Mac with Chris's Max Plan auth.
- BUG found while migrating: the old launchd script POSTed to `https://www.goodsoilharvest.com/...` which 301-redirects to apex, and curl drops the POST body on redirect — so the weekly digest had been silently failing. The new cron worker uses apex directly. A manual test POST to apex returned `{"sent":1,"skipped":0,"totalSubscribers":1}` — confirmed working.
- Stripe + DB hygiene (also done today): deleted Thomas's stale Stripe-tied subscription row in D1 (`cmo098pba000104jsup7v3r4s`, was tied to `cus_ULCXRqrWosSMfe` which Chris deleted on the Stripe side). Both admins (`chris@anomalistenterprise.com`, `thomas@anomalistenterprise.com`) verified as role=ADMIN, email_verified=1. Reset link emailed to Thomas for first login.

### Correction to 2026-05-18 entry

- The note "cf-pages-migration is 0 ahead / 17 behind main; abandon it" was wrong. Local `cf-pages-migration` is the actual source of production — it has all the OpenNext + raw-D1 rewrite work and was the source of the 2026-05-11 deploy. `main` is the *old Neon-era code* that never received the migration. Do **not** deploy from `main`; it would roll the site back to Prisma+Neon.

### GH ↔ CF source-of-truth drift (action needed eventually, not blocking)

- Production was deployed 2026-05-11 19:06 UTC by `whitestone226@pm.me` via `wrangler` from `~/Documents/projects/good-soil-harvest`, branch `cf-pages-migration`.
- Local `cf-pages-migration` is 21 commits ahead of `origin/cf-pages-migration` (most are rebased dupes of the same content with different hashes, plus 7 truly local commits: `.well-known/security.txt` routing + Sentinel workflows + this DEVLOG). The actually-deployed code lives only on Chris's Mac.
- Recommended next step (not yet executed): push local `cf-pages-migration` to a *new* branch on origin (e.g. `production` or `cf-deployed-2026-05`) so GitHub has a faithful backup. Do NOT force-push over `origin/cf-pages-migration` or `main` without explicit decision.

---

## 2026-05-18 — chris-cc — bootstrap DEVLOG.md

- Created this `DEVLOG.md`. CLAUDE.md already existed in this repo (last touched 2026-04-05); not modified.
- No code changes.
- Captures current state: GSH is fully on LLC CF (zone moved + worker + D1 + R2 all live on LLC as of 2026-05-11/2026-05-17), Personal-account leftovers all deleted, apex serves HTTP 200 via the LLC `goodsoilharvest` worker.

### NEXT

- Sentinel currently flags 9 Next.js advisories on this repo (`#771, #776, #778, #779, #773, #775, #777, #780, #772, #774` — mix of high/medium/low) — part of the org-wide Next.js wave (17 findings across GSH + Openclaw-Maximus). Auto-fix PRs are queued; will dispatch once GH Actions cap resets 2026-06-01.
- Daily Good Soil blog cron continues to run nightly (~03:00). The `cf-pages-migration` branch is stale (0 ahead / 17 behind main) — abandon it during cleanup per MASTER-TODO.
