import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbRun, createId, nowISO } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const VALID_TYPES = ["BUG", "FEATURE", "COMMENT", "QUESTION"] as const;
type FeedbackType = (typeof VALID_TYPES)[number];

export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json();
  const { message, type, pageUrl } = body as {
    message?: string;
    type?: string;
    pageUrl?: string;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
  }

  // Rate limit: 10 feedback items per hour per user (or IP if anonymous)
  const identifier = session?.user?.id ?? getClientIp(req);
  const limit = await rateLimit({
    action: "feedback",
    identifier,
    max: 10,
    windowSeconds: 60 * 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too much feedback, too fast. Please wait a bit and try again." },
      { status: 429 }
    );
  }

  const feedbackType: FeedbackType =
    type && VALID_TYPES.includes(type as FeedbackType) ? (type as FeedbackType) : "COMMENT";

  await dbRun(
    `INSERT INTO feedback (id, user_id, email, message, type, page_url, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    createId(),
    session?.user?.id ?? null,
    session?.user?.email ?? null,
    message.trim(),
    feedbackType,
    pageUrl?.slice(0, 500) ?? null,
    req.headers.get("user-agent")?.slice(0, 300) ?? null,
    nowISO(), nowISO(),
  );

  return NextResponse.json({ ok: true });
}
