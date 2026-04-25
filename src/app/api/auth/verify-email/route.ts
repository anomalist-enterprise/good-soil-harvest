import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, type UserRow } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

// Web Crypto randomUUID — works on edge + Node 19+
function randomUUID(): string {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = body.code as string | undefined;
  const rawEmail = body.email as string | undefined;

  if (!rawEmail || !code) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();
  const user = await dbFirst<UserRow>(`SELECT * FROM users WHERE email = ?`, email);

  if (!user) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const wasVerified = user.email_verified === 1;
  if (!wasVerified) {
    if (!user.verify_token || user.verify_token !== code.trim()) {
      return NextResponse.json({ error: "Incorrect code — check your email and try again" }, { status: 400 });
    }
    if (user.verify_token_exp) {
      const expMs = Date.parse(user.verify_token_exp.replace(" ", "T") + "Z");
      if (expMs < Date.now()) {
        return NextResponse.json({ error: "Code expired — request a new one below" }, { status: 400 });
      }
    }
  }

  const loginToken = randomUUID();
  const loginTokenExpISO = new Date(Date.now() + 1000 * 60 * 5).toISOString().replace("T", " ").slice(0, 19);

  await dbRun(
    `UPDATE users SET email_verified = 1, verify_token = ?, verify_token_exp = ? WHERE id = ?`,
    loginToken, loginTokenExpISO, user.id,
  );

  if (!wasVerified) {
    sendWelcomeEmail(user.email).catch(console.error);
  }

  return NextResponse.json({ ok: true, loginToken });
}
