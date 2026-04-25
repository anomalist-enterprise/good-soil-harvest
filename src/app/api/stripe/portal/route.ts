import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { dbFirst, type SubscriptionRow } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await dbFirst<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE user_id = ?`, session.user.id,
  );

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "https://goodsoilharvest.com";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/account?sync=1`,
  });

  return NextResponse.json({ url: portalSession.url });
}
