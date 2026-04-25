import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, PLANS, assertStripeUrl, type PlanKey, planFromPriceId } from "@/lib/stripe";
import { dbFirst, dbRun, type SubscriptionRow } from "@/lib/db";

// Mirrors upgrade-portal: trial → direct API; otherwise → Customer Portal.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = (await req.json()) as { plan: PlanKey };
  if (!PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const targetPriceId = PLANS[plan].priceId;
  if (!targetPriceId) {
    return NextResponse.json({ error: "Stripe price ID not configured" }, { status: 500 });
  }

  const subscription = await dbFirst<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE user_id = ?`, session.user.id,
  );

  if (!subscription?.stripe_customer_id || !subscription.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: "Subscription has no items" }, { status: 500 });
  }

  const currentPriceId = stripeSub.items.data[0]?.price.id;
  if (currentPriceId === targetPriceId) {
    return NextResponse.json({ ok: true, alreadyOnPlan: true });
  }

  const isInTrial =
    stripeSub.status === "trialing" ||
    (stripeSub.trial_end !== null && stripeSub.trial_end * 1000 > Date.now());

  if (isInTrial) {
    const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [{ id: itemId, price: targetPriceId, quantity: 1 }],
      trial_end: stripeSub.trial_end ?? undefined,
      proration_behavior: "none",
      metadata: { userId: session.user.id, plan },
    });

    const newPlan = planFromPriceId(targetPriceId) ?? plan;
    const periodEnd =
      (updated.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end ?? null;
    const periodEndISO = periodEnd ? new Date(periodEnd * 1000).toISOString().replace("T", " ").slice(0, 19) : null;
    const trialEndISO = updated.trial_end ? new Date(updated.trial_end * 1000).toISOString().replace("T", " ").slice(0, 19) : null;

    await dbRun(
      `UPDATE subscriptions SET plan = ?, trial_end = ?, current_period_end = ? WHERE user_id = ?`,
      newPlan, trialEndISO, periodEndISO, session.user.id,
    );

    return NextResponse.json({
      ok: true,
      downgraded: true,
      trialPreserved: true,
      newPlan,
    });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "https://goodsoilharvest.com";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/account?sync=1`,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.stripe_subscription_id,
        items: [{ id: itemId, price: targetPriceId, quantity: 1 }],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url: `${origin}/account?sync=1` },
      },
    },
  });

  return NextResponse.json({ url: assertStripeUrl(portalSession.url) });
}
