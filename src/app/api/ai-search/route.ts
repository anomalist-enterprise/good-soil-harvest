import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbAll, dbFirst, dbRun, createId, type PostRow, type SubscriptionRow, fromBit, toDate, nowISO } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();  // reads ANTHROPIC_API_KEY automatically

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AI search is a Deep Roots exclusive — check DB directly (not stale JWT)
  // Admin users also get access.
  const user = await dbFirst<{
    role: string;
    sub_plan: SubscriptionRow["plan"] | null;
    sub_status: SubscriptionRow["status"] | null;
  }>(
    `SELECT u.role, s.plan AS sub_plan, s.status AS sub_status
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = ?`,
    session.user.id,
  );
  const isAdmin = user?.role === "ADMIN";
  const isDeepRoots = user?.sub_plan === "DEEP_ROOTS" && user?.sub_status === "ACTIVE";
  if (!isAdmin && !isDeepRoots) {
    return NextResponse.json({ error: "Deep Roots membership required" }, { status: 403 });
  }

  // Rate limit: 30 searches per hour per user (protects against cost abuse).
  // Each call is ~$0.0001-0.0004 so 30/hr is generous but bounds worst case.
  const limit = await rateLimit({
    action: "ai-search",
    identifier: session.user.id,
    max: 30,
    windowSeconds: 60 * 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `You've used all your AI searches this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      },
      { status: 429 }
    );
  }

  const { query } = (await req.json()) as { query?: string };
  if (!query?.trim()) {
    return NextResponse.json({ posts: [] });
  }

  const rows = await dbAll<Pick<PostRow, "id" | "slug" | "title" | "description" | "niche" | "is_premium" | "is_deep_roots" | "published_at" | "featured_image">>(
    `SELECT id, slug, title, description, niche, is_premium, is_deep_roots, published_at, featured_image
     FROM posts WHERE status = ? ORDER BY published_at DESC`,
    "PUBLISHED",
  );
  const posts = rows.map(r => ({
    id: r.id, slug: r.slug, title: r.title, description: r.description, niche: r.niche,
    isPremium: fromBit(r.is_premium), isDeepRoots: fromBit(r.is_deep_roots),
    publishedAt: toDate(r.published_at), featuredImage: r.featured_image,
  }));

  if (posts.length === 0) return NextResponse.json({ posts: [] });

  const catalog = posts
    .map((p, i) => `[${i}] ${p.title} (${p.niche}) — ${p.description}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    system:
      "You are a reading recommendation assistant. Given a reader's interest and a list of articles, return the indices of the 6 most relevant articles as a JSON array sorted best-first. Output ONLY the JSON array — no explanation, no markdown.",
    messages: [
      {
        role: "user",
        content: `Reader interest: "${query.trim()}"\n\nArticles:\n${catalog}`,
      },
      // Prefill forces Haiku to start mid-JSON — guarantees clean output
      {
        role: "assistant",
        content: "[",
      },
    ],
  });

  // Log token usage for cost tracking (fire-and-forget)
  dbRun(
    `INSERT INTO ai_search_logs (id, user_id, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?)`,
    createId(), session.user.id, message.usage.input_tokens, message.usage.output_tokens, nowISO(),
  ).catch(() => {});

  // Response starts after our "[" prefill, so prepend it back
  const raw = "[" + (message.content[0].type === "text" ? message.content[0].text.trim() : "");

  let indices: number[] = [];
  try {
    // Try direct parse first, then fall back to regex extraction
    indices = JSON.parse(raw);
  } catch {
    const match = raw.match(/\[\s*[\d,\s]+\s*\]/);
    if (match) {
      try { indices = JSON.parse(match[0]); } catch { indices = []; }
    }
  }

  if (!Array.isArray(indices)) indices = [];

  const results = indices
    .filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < posts.length)
    .slice(0, 6)
    .map((i) => posts[i]);

  return NextResponse.json({ posts: results });
}
