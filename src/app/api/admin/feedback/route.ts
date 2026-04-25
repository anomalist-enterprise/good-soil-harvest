import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbAll, dbRun, type FeedbackRow } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await dbAll<FeedbackRow>(
    `SELECT * FROM feedback
     ORDER BY ai_priority ASC, created_at DESC
     LIMIT 200`,
  );

  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  await dbRun(`UPDATE feedback SET status = ? WHERE id = ?`, status, id);
  return NextResponse.json({ ok: true });
}
