import { NextRequest, NextResponse } from "next/server";
import { dbAll, dbFirst } from "@/lib/db";
import { sendWeeklyDigest } from "@/lib/email";

// Weekly digest endpoint — called by launchd cron every Sunday at 9 AM.
// Sends an email to each user who opted into emailDigest with articles
// from the past 7 days matching their subscribed niches.
// Protected by AGENT_API_SECRET.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneWeekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().replace("T", " ").slice(0, 19);

  const subs = await dbAll<{ user_id: string; niches: string }>(
    `SELECT user_id, niches FROM push_subscriptions WHERE email_digest = 1`,
  );

  const userNiches = new Map<string, Set<string>>();
  for (const sub of subs) {
    const existing = userNiches.get(sub.user_id) ?? new Set<string>();
    for (const n of sub.niches.split(",").filter(Boolean)) existing.add(n);
    userNiches.set(sub.user_id, existing);
  }

  if (userNiches.size === 0) {
    return NextResponse.json({ sent: 0, reason: "no digest subscribers" });
  }

  const recentPosts = await dbAll<{ title: string; slug: string; niche: string; description: string }>(
    `SELECT title, slug, niche, description FROM posts
     WHERE status = 'PUBLISHED' AND published_at >= ?
     ORDER BY published_at DESC`,
    oneWeekAgoISO,
  );

  let sent = 0;
  let skipped = 0;

  for (const [userId, nichesSet] of userNiches) {
    const user = await dbFirst<{ email: string }>(`SELECT email FROM users WHERE id = ?`, userId);
    if (!user?.email) { skipped++; continue; }

    const matching = recentPosts.filter(p => nichesSet.has(p.niche));
    if (matching.length === 0) { skipped++; continue; }

    try {
      await sendWeeklyDigest(user.email, matching);
      sent++;
    } catch (err) {
      console.error(`[digest] failed for ${user.email}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, totalSubscribers: userNiches.size });
}
