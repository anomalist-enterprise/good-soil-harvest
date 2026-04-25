import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbAll, dbRun, createId, nowISO } from "@/lib/db";

// Subscribe to push notifications and/or update topic preferences.
// Body: { endpoint, p256dh, auth, niches?: string[], emailDigest?: boolean }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint, p256dh, auth: authKey, niches, emailDigest } = body;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Missing push subscription fields" }, { status: 400 });
  }

  const nicheStr = Array.isArray(niches) ? niches.join(",") : "";

  // Prevent cross-user hijacking: delete this endpoint if it belongs to a
  // DIFFERENT user, then upsert under the current session.
  await dbRun(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id != ?`, endpoint, session.user.id);

  await dbRun(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, niches, email_digest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       niches = excluded.niches,
       email_digest = excluded.email_digest`,
    createId(), session.user.id, endpoint, p256dh, authKey,
    nicheStr, emailDigest ? 1 : 0, nowISO(),
  );

  return NextResponse.json({ ok: true });
}

// Get current user's push subscriptions and preferences
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await dbAll<{ id: string; endpoint: string; niches: string; email_digest: 0 | 1; created_at: string }>(
    `SELECT id, endpoint, niches, email_digest, created_at FROM push_subscriptions WHERE user_id = ?`,
    session.user.id,
  );
  const subscriptions = rows.map(r => ({
    id: r.id,
    endpoint: r.endpoint,
    niches: r.niches,
    emailDigest: r.email_digest === 1,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ subscriptions });
}

// Unsubscribe from push notifications
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  await dbRun(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, session.user.id, endpoint);

  return NextResponse.json({ ok: true });
}
