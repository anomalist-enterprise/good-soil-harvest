import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbFirst, dbRun, createId, nowISO } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = (await req.json()) as { postId?: string };
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  const userId = session.user.id;
  const existing = await dbFirst<{ id: string }>(
    `SELECT id FROM post_likes WHERE user_id = ? AND post_id = ?`,
    userId, postId,
  );

  if (existing) {
    await dbRun(`DELETE FROM post_likes WHERE id = ?`, existing.id);
    return NextResponse.json({ liked: false });
  } else {
    await dbRun(
      `INSERT INTO post_likes (id, user_id, post_id, liked_at) VALUES (?, ?, ?, ?)`,
      createId(), userId, postId, nowISO(),
    );
    return NextResponse.json({ liked: true });
  }
}
