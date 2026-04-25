import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, type AgentDraftRow, createId, nowISO } from "@/lib/db";
import { auth } from "@/auth";
import { notifyNewPosts } from "@/lib/push";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action, title, description, content, isPremium, isDeepRoots } = await req.json();

  const draft = await dbFirst<AgentDraftRow>(`SELECT * FROM agent_drafts WHERE id = ?`, id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    await dbRun(
      `UPDATE agent_drafts SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
      nowISO(), session.user?.email ?? "", id,
    );
    return NextResponse.json({ ok: true });
  }

  // approve or edit — create a Post + flip draft status
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const uniqueSlug = `${slug}-${Date.now()}`;

  // D1 supports batch — wrap both writes in a single transaction
  const postId = createId();
  await dbRun(
    `INSERT INTO posts
       (id, slug, title, description, content, niche, is_premium, is_deep_roots, status, published_at, featured_image, refs, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?)`,
    postId, uniqueSlug, title, description, content, draft.niche,
    isPremium ? 1 : 0, isDeepRoots ? 1 : 0,
    nowISO(), draft.featured_image, draft.refs, nowISO(), nowISO(),
  );
  await dbRun(
    `UPDATE agent_drafts SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
    action === "edit" ? "EDITED" : "APPROVED", nowISO(), session.user?.email ?? "", id,
  );

  // Fire push notifications for subscribers who opted into this niche.
  notifyNewPosts({
    posts: [{ title, niche: draft.niche, slug: uniqueSlug }],
  }).catch((err) => console.error("[drafts/approve] push notify failed:", err));

  return NextResponse.json({ ok: true });
}
