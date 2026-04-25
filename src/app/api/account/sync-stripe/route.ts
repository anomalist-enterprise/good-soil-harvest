import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { dbRun, createId, nowISO } from "@/lib/db";

// Looks up the logged-in user's Stripe subscription (active OR trialing)
// and syncs it to the DB. Called after checkout completes.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customers = await stripe.customers.list({ email: session.user.email, limit: 5 });
  if (!customers.data.length) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
  }
  const customer = customers.data[0];

  let stripeSub = null;
  for (const status of ["active", "trialing"] as const) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status, limit: 1 });
    if (subs.data.length) { stripeSub = subs.data[0]; break; }
  }
  if (!stripeSub) {
    return NextResponse.json({ error: "No active or trialing subscription found" }, { status: 404 });
  }

  const priceId = stripeSub.items?.data?.[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId) ?? (stripeSub.metadata?.plan as "SEEDLING" | "DEEP_ROOTS") ?? "SEEDLING";
  const item = stripeSub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const periodEndISO = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString().replace("T", " ").slice(0, 19)
    : null;
  const trialEndISO = stripeSub.trial_end
    ? new Date(stripeSub.trial_end * 1000).toISOString().replace("T", " ").slice(0, 19)
    : null;

  // Upsert by user_id (UNIQUE on subscriptions.user_id)
  await dbRun(
    `INSERT INTO subscriptions
       (id, user_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end, trial_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = 'ACTIVE',
       plan = excluded.plan,
       current_period_end = excluded.current_period_end,
       trial_end = excluded.trial_end,
       updated_at = excluded.updated_at`,
    createId(), session.user.id, customer.id, stripeSub.id, plan, periodEndISO, trialEndISO, nowISO(), nowISO(),
  );

  return NextResponse.json({ ok: true, plan, trialEnd: trialEndISO });
}
