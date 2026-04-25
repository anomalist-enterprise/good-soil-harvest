import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, PLANS, assertStripeUrl, type PlanKey } from "@/lib/stripe";
import { dbFirst, dbRun, createId, type UserRow, type SubscriptionRow } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await dbFirst<UserRow>(`SELECT * FROM users WHERE id = ?`, session.user.id!);
    if (user && user.email_verified !== 1) {
      return NextResponse.json({ error: "unverified", email: session.user.email }, { status: 403 });
    }

    if (user?.role === "ADMIN") {
      return NextResponse.json(
        { error: "admin_comp", message: "Admin accounts have free Deep Roots access" },
        { status: 403 }
      );
    }

    const { plan } = (await req.json()) as { plan: PlanKey };
    if (!PLANS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = PLANS[plan].priceId;
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID not configured — check STRIPE_PRICE_SEEDLING / STRIPE_PRICE_DEEP_ROOTS env vars" },
        { status: 500 }
      );
    }

    const existingSub = await dbFirst<SubscriptionRow>(
      `SELECT * FROM subscriptions WHERE user_id = ?`, session.user.id!,
    );

    if (
      existingSub?.stripe_subscription_id &&
      (existingSub.status === "ACTIVE" || existingSub.status === "PAST_DUE")
    ) {
      return NextResponse.json(
        { error: "use_portal", message: "Use /api/stripe/upgrade-portal for plan changes" },
        { status: 409 }
      );
    }

    let customerId = existingSub?.stripe_customer_id;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: session.user.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
        await stripe.customers.update(customerId, {
          metadata: { userId: session.user.id! },
        });
      } else {
        const customer = await stripe.customers.create({
          email: session.user.email,
          metadata: { userId: session.user.id! },
        });
        customerId = customer.id;
      }
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXTAUTH_URL ??
      "https://goodsoilharvest.com";

    const emailLower = session.user.email.toLowerCase();
    const priorClaim = await dbFirst<{ email: string }>(
      `SELECT email FROM trial_claims WHERE email = ?`, emailLower,
    );
    const grantTrial = !priorClaim;

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/pricing`,
      metadata: { userId: session.user.id!, plan, trialGranted: grantTrial ? "1" : "0" },
      subscription_data: {
        ...(grantTrial ? { trial_period_days: 7 } : {}),
        metadata: { userId: session.user.id!, plan },
      },
    });

    if (grantTrial) {
      try {
        await dbRun(
          `INSERT INTO trial_claims (id, email) VALUES (?, ?)`,
          createId(), emailLower,
        );
      } catch {
        // race — already exists, fine
      }
    }

    return NextResponse.json({ url: assertStripeUrl(checkoutSession.url) });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
