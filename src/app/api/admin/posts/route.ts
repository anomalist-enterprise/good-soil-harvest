import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, createId, nowISO } from "@/lib/db";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, description, content, niche, isPremium, isDeepRoots, status } = await req.json();

  if (!title || !niche) {
    return NextResponse.json({ error: "Title and niche are required" }, { status: 400 });
  }

  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const slug = `${base}-${Date.now()}`;

  // Auto-premium: if isPremium not explicitly set, mark every 3rd + 5th of 5
  let markPremium = isPremium ?? false;
  if (isPremium === undefined || isPremium === null) {
    const totalRow = await dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM posts`);
    const total = totalRow?.n ?? 0;
    markPremium = total % 5 === 2 || total % 5 === 4;
  }

  const id = createId();
  const publishedAt = status === "PUBLISHED" ? nowISO() : null;

  await dbRun(
    `INSERT INTO posts (id, slug, title, description, content, niche, is_premium, is_deep_roots, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, slug, title, description ?? "", content ?? "", niche,
    markPremium ? 1 : 0, isDeepRoots ? 1 : 0,
    status ?? "DRAFT", publishedAt, nowISO(), nowISO(),
  );

  return NextResponse.json({ id });
}
