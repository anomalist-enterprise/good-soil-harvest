import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, type UserRow } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawEmail = body.email as string | undefined;
  if (!rawEmail) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const email = rawEmail.trim().toLowerCase();

  const limit = await rateLimit({
    action: "resend-verification",
    identifier: email,
    max: 3,
    windowSeconds: 60 * 10,
  });
  if (!limit.ok) {
    return NextResponse.json({ ok: true });
  }

  const user = await dbFirst<UserRow>(`SELECT id, email_verified FROM users WHERE email = ?`, email);
  if (!user || user.email_verified === 1) {
    return NextResponse.json({ ok: true });
  }

  const code = generateCode();
  const expISO = new Date(Date.now() + 1000 * 60 * 30).toISOString().replace("T", " ").slice(0, 19);

  await dbRun(
    `UPDATE users SET verify_token = ?, verify_token_exp = ? WHERE id = ?`,
    code, expISO, user.id,
  );

  await sendVerificationEmail(email, code);
  return NextResponse.json({ ok: true });
}
