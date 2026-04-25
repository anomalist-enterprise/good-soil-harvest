import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

function randomUUID(): string {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawEmail = body.email as string | undefined;

  if (!rawEmail) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  const emailLimit = await rateLimit({
    action: "forgot-password",
    identifier: email,
    max: 3,
    windowSeconds: 60 * 15,
  });
  if (!emailLimit.ok) return NextResponse.json({ ok: true });
  const ipLimit = await rateLimit({
    action: "forgot-password-ip",
    identifier: getClientIp(req),
    max: 10,
    windowSeconds: 60 * 15,
  });
  if (!ipLimit.ok) return NextResponse.json({ ok: true });

  const user = await dbFirst<{ id: string }>(`SELECT id FROM users WHERE email = ?`, email);

  // Always return ok — never reveal whether the email exists
  if (!user) return NextResponse.json({ ok: true });

  const token = randomUUID();
  const expISO = new Date(Date.now() + 1000 * 60 * 30).toISOString().replace("T", " ").slice(0, 19);

  await dbRun(
    `UPDATE users SET reset_token = ?, reset_token_exp = ? WHERE id = ?`,
    token, expISO, user.id,
  );

  try {
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    console.error("[forgot-password] email send failed", err);
  }

  return NextResponse.json({ ok: true });
}
