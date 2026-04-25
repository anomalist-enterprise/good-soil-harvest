import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbFirst, dbRun, type UserRow } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both fields are required" }, { status: 400 });
  }

  const user = await dbFirst<UserRow>(`SELECT * FROM users WHERE id = ?`, session.user.id);
  if (!user?.password_hash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const pwErrors: string[] = [];
  if (newPassword.length < 8)             pwErrors.push("at least 8 characters");
  if (!/[A-Z]/.test(newPassword))         pwErrors.push("one uppercase letter");
  if (!/[0-9]/.test(newPassword))         pwErrors.push("one number");
  if (!/[^A-Za-z0-9]/.test(newPassword)) pwErrors.push("one special character");
  if (pwErrors.length) {
    return NextResponse.json(
      { error: `Password must contain: ${pwErrors.join(", ")}` },
      { status: 400 }
    );
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, newHash, user.id);

  return NextResponse.json({ ok: true });
}
