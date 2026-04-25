import { NextRequest, NextResponse } from "next/server";
import { dbAll, dbRun, createId, nowISO } from "@/lib/db";

function checkAuth(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return false;
  return true;
}

// GET existing titles so the daily blog run can dedupe.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [posts, drafts] = await Promise.all([
    dbAll<{ title: string; niche: string }>(`SELECT title, niche FROM posts`),
    dbAll<{ title: string; niche: string }>(`SELECT title, niche FROM agent_drafts`),
  ]);

  return NextResponse.json({ posts, drafts });
}

// Agents POST drafts here with a shared secret in the Authorization header.
// Header: Authorization: Bearer <AGENT_API_SECRET>
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, content, niche, isPremium, isDeepRoots, agentName, notes, featuredImage, references } = body;

  if (!title || !content || !niche || !agentName) {
    return NextResponse.json({ error: "Missing required fields: title, content, niche, agentName" }, { status: 400 });
  }

  const validNiches = ["faith", "finance", "psychology", "philosophy", "science"];
  if (!validNiches.includes(niche)) {
    return NextResponse.json({ error: `Invalid niche. Must be one of: ${validNiches.join(", ")}` }, { status: 400 });
  }

  const draftId = createId();
  await dbRun(
    `INSERT INTO agent_drafts
       (id, title, description, content, niche, is_premium, is_deep_roots, featured_image, refs, agent_name, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    draftId, title, description ?? "", content, niche,
    isPremium ? 1 : 0, isDeepRoots ? 1 : 0,
    featuredImage ?? null, references ?? null, agentName, notes ?? null, nowISO(),
  );

  return NextResponse.json({ ok: true, draftId }, { status: 201 });
}
