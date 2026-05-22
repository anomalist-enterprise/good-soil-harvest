import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Weekly cleanup endpoint — call from launchd cron (same shape as
// /api/notifications/digest). Reclaims rows that would otherwise grow
// unbounded: expired sessions, stale rate-limit windows, orphan
// affiliate links left behind by manual DB edits.
//
// Protected by AGENT_API_SECRET (same as the digest / blog pipeline).
//
// Deletes are batched (≤BATCH_SIZE rows per pass) and capped per
// invocation so a single run can't monopolize a DB connection.
//
// NOTE: PushSubscription is intentionally skipped — the schema has no
// last_contacted column to drive a staleness check. Add cleanup here
// once that column exists (see Sentinel finding #1309).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const BATCH_SIZE = 1000;
  const MAX_PASSES = 50; // safety cap → at most 50k rows per table per run

  const now = new Date();
  const rateLimitCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result = {
    sessions: 0,
    rateLimits: 0,
    affiliateLinks: 0,
    pushSubscriptions: 0, // skipped — no last_contacted column
  };

  // Expired sessions (expiresAt < now)
  for (let i = 0; i < MAX_PASSES; i++) {
    const expired = await prisma.session.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (expired.length === 0) break;
    const { count } = await prisma.session.deleteMany({
      where: { id: { in: expired.map(s => s.id) } },
    });
    result.sessions += count;
    if (expired.length < BATCH_SIZE) break;
  }

  // Stale rate-limit rows (windowStart older than 30 days)
  for (let i = 0; i < MAX_PASSES; i++) {
    const stale = await prisma.rateLimit.findMany({
      where: { windowStart: { lt: rateLimitCutoff } },
      select: { key: true },
      take: BATCH_SIZE,
    });
    if (stale.length === 0) break;
    const { count } = await prisma.rateLimit.deleteMany({
      where: { key: { in: stale.map(r => r.key) } },
    });
    result.rateLimits += count;
    if (stale.length < BATCH_SIZE) break;
  }

  // Orphan affiliate links — schema has onDelete: Cascade so these
  // should be rare, but manual DB edits or partial restores can leave
  // them behind. Defensive sweep via raw SQL (the relation is required,
  // so Prisma's `post: { is: null }` filter isn't available).
  for (let i = 0; i < MAX_PASSES; i++) {
    const count = await prisma.$executeRaw`
      DELETE FROM "AffiliateLink"
      WHERE "id" IN (
        SELECT a."id" FROM "AffiliateLink" a
        LEFT JOIN "Post" p ON p."id" = a."postId"
        WHERE p."id" IS NULL
        LIMIT ${BATCH_SIZE}
      )
    `;
    result.affiliateLinks += count;
    if (count < BATCH_SIZE) break;
  }

  return NextResponse.json(result);
}
