import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWeeklyDigest } from "@/lib/email";

// Weekly digest endpoint — called by launchd cron every Sunday at 9 AM.
// Sends an email to each user who opted into emailDigest with articles
// from the past 7 days matching their subscribed niches.
// Protected by AGENT_API_SECRET (same as the blog pipeline).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get all users who opted into email digest
  const subs = await prisma.pushSubscription.findMany({
    where: { emailDigest: true },
    select: { userId: true, niches: true },
  });

  // Dedupe by userId (a user might have multiple push subscriptions)
  const userNiches = new Map<string, Set<string>>();
  for (const sub of subs) {
    const existing = userNiches.get(sub.userId) ?? new Set<string>();
    for (const n of sub.niches.split(",").filter(Boolean)) existing.add(n);
    userNiches.set(sub.userId, existing);
  }

  if (userNiches.size === 0) {
    return NextResponse.json({ sent: 0, reason: "no digest subscribers" });
  }

  // Get posts from the last 7 days
  const recentPosts = await prisma.post.findMany({
    where: { status: "PUBLISHED", publishedAt: { gte: oneWeekAgo } },
    orderBy: { publishedAt: "desc" },
    select: { title: true, slug: true, niche: true, description: true },
  });

  // Fetch all user emails in a single query to avoid N+1 round-trips.
  const userIds = Array.from(userNiches.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(users.map(u => [u.id, u.email]));

  let sent = 0;
  let skipped = 0;

  for (const [userId, nichesSet] of userNiches) {
    const email = emailById.get(userId);
    if (!email) { skipped++; continue; }

    const matching = recentPosts.filter(p => nichesSet.has(p.niche));
    if (matching.length === 0) { skipped++; continue; }

    try {
      await sendWeeklyDigest(email, matching);
      sent++;
    } catch (err) {
      console.error(`[digest] failed for ${email}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, totalSubscribers: userNiches.size });
}
