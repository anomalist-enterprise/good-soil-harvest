import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, type PostRow, nowISO } from "@/lib/db";
import { auth } from "@/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { title, description, content, niche, isPremium, status } = await req.json();

  const post = await dbFirst<PostRow>(`SELECT * FROM posts WHERE id = ?`, id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let slug = post.slug;
  if (title !== post.title) {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80);
    slug = `${base}-${Date.now()}`;
  }

  const publishedAt = status === "PUBLISHED" && !post.published_at ? nowISO() : post.published_at;

  await dbRun(
    `UPDATE posts SET title = ?, description = ?, content = ?, niche = ?, is_premium = ?, status = ?, slug = ?, published_at = ?
     WHERE id = ?`,
    title, description, content, niche, isPremium ? 1 : 0, status, slug, publishedAt, id,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Manual cleanup of dependent rows since SQLite FK enforcement is per-session
  await dbRun(`DELETE FROM post_likes WHERE post_id = ?`, id);
  await dbRun(`DELETE FROM post_views WHERE post_id = ?`, id);
  await dbRun(`DELETE FROM affiliate_links WHERE post_id = ?`, id);
  await dbRun(`DELETE FROM posts WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
