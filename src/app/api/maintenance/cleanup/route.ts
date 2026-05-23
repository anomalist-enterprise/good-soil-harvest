import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun } from "@/lib/db";

// Weekly DB cleanup endpoint — called by the cron-cleanup Worker on a weekly
// schedule. Removes rows that would otherwise grow unbounded:
//
//   * sessions          where expires_at < now()
//   * rate_limits       where window_start < now() - 30 days
//   * affiliate_links   whose parent post no longer exists (FKs are advisory
//                       on D1, so orphans linger after a post delete)
//
// Notes:
//   * push_subscriptions has no last_contacted column today, so stale-push
//     cleanup is intentionally not implemented here (per Sentinel #1309).
//   * Deletes are batched (BATCH_SIZE rows per pass) to stay under D1's
//     per-statement row limits and per-request CPU budget. We cap the total
//     passes per table at MAX_PASSES so a single weekly invocation can't
//     run away if a table is very large; whatever's left rolls into the
//     next weekly run.
//
// Protected by AGENT_API_SECRET (same shared-secret model as the digest job).
// Sentinel finding #1309.

const BATCH_SIZE = 1000;
const MAX_PASSES = 10;

type CleanupResult = { table: string; deleted: number; passes: number };

async function batchedDelete(
  table: string,
  whereClause: string,
  binds: unknown[] = [],
): Promise<CleanupResult> {
  let deleted = 0;
  let passes = 0;
  for (let i = 0; i < MAX_PASSES; i++) {
    const res = await dbRun(
      `DELETE FROM ${table} WHERE rowid IN (
         SELECT rowid FROM ${table} WHERE ${whereClause} LIMIT ${BATCH_SIZE}
       )`,
      ...binds,
    );
    const changes = res.meta?.changes ?? 0;
    passes++;
    deleted += changes;
    if (changes < BATCH_SIZE) break;
  }
  return { table, deleted, passes };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: CleanupResult[] = [];

  try {
    results.push(
      await batchedDelete("sessions", "expires_at < datetime('now')"),
    );
    results.push(
      await batchedDelete(
        "rate_limits",
        "window_start < datetime('now', '-30 days')",
      ),
    );
    results.push(
      await batchedDelete(
        "affiliate_links",
        "post_id NOT IN (SELECT id FROM posts)",
      ),
    );
  } catch (err) {
    console.error("[cleanup] failed:", err);
    return NextResponse.json(
      { error: "Cleanup failed", message: (err as Error).message, results },
      { status: 500 },
    );
  }

  // Cheap health-check counts so the response is useful in logs.
  const [sessions, rateLimits, affiliateLinks] = await Promise.all([
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions`),
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM rate_limits`),
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM affiliate_links`),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: results,
    remaining: {
      sessions: sessions?.n ?? null,
      rate_limits: rateLimits?.n ?? null,
      affiliate_links: affiliateLinks?.n ?? null,
    },
  });
}
