import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";
import { dbFirst, type UserRow } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const rawEmail = searchParams.get("email");
  const plan  = searchParams.get("plan");

  const siteUrl = process.env.NEXTAUTH_URL ?? "https://goodsoilharvest.com";

  if (!token || !rawEmail) {
    return NextResponse.redirect(new URL("/sign-in", siteUrl));
  }

  const email = rawEmail.trim().toLowerCase();

  const user = await dbFirst<UserRow>(`SELECT * FROM users WHERE email = ?`, email);
  const valid = (() => {
    if (!user || !user.verify_token || user.verify_token !== token || !user.verify_token_exp) return false;
    return Date.parse(user.verify_token_exp.replace(" ", "T") + "Z") >= Date.now();
  })();

  if (!valid) {
    return NextResponse.redirect(new URL("/sign-in?error=expired", siteUrl));
  }

  const redirectTo = plan ? `/dashboard?checkout=${plan}` : "/dashboard";
  await signIn("credentials", { email, loginToken: token, redirectTo });
}
