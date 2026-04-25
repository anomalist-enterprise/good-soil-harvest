import { NextRequest, NextResponse } from "next/server";
import { dbFirst, dbRun, type UserRow } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = body.token as string | undefined;
  const rawEmail = body.email as string | undefined;
  const password = body.password as string | undefined;

  if (!token || !rawEmail || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  const emailLimit = await rateLimit({
    action: "reset-password",
    identifier: email,
    max: 10,
    windowSeconds: 60 * 15,
  });
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(emailLimit.retryAfterSeconds / 60)} minutes.` },
      { status: 429 }
    );
  }
  const ipLimit = await rateLimit({
    action: "reset-password-ip",
    identifier: getClientIp(req),
    max: 20,
    windowSeconds: 60 * 15,
  });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minutes.` },
      { status: 429 }
    );
  }

  const pwErrors = [];
  if (password.length < 8)             pwErrors.push("at least 8 characters");
  if (!/[A-Z]/.test(password))         pwErrors.push("one uppercase letter");
  if (!/[0-9]/.test(password))         pwErrors.push("one number");
  if (!/[^A-Za-z0-9]/.test(password)) pwErrors.push("one special character");
  if (pwErrors.length) {
    return NextResponse.json(
      { error: `Password must contain: ${pwErrors.join(", ")}` },
      { status: 400 }
    );
  }

  const user = await dbFirst<UserRow>(`SELECT * FROM users WHERE email = ?`, email);

  const tokenValid = (() => {
    if (!user || !user.reset_token || user.reset_token !== token || !user.reset_token_exp) return false;
    const expMs = Date.parse(user.reset_token_exp.replace(" ", "T") + "Z");
    return expMs >= Date.now();
  })();

  if (!user || !tokenValid) {
    return NextResponse.json(
      { error: "This reset link has expired or is invalid. Request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 13);

  await dbRun(
    `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_exp = NULL, email_verified = 1
     WHERE id = ?`,
    passwordHash, user.id,
  );

  return NextResponse.json({ ok: true });
}
