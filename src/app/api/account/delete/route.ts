import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbFirst, dbRun, createId, type SubscriptionRow } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email?.toLowerCase() ?? null;

  const subscription = await dbFirst<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE user_id = ?`, userId,
  );
  const stripe = getStripe();

  let refundedCents = 0;

  if (subscription?.stripe_subscription_id) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      refundedCents = await issueProratedRefund(stripe, stripeSub);
    } catch (err) {
      console.error("[account/delete] refund path failed:", err);
    }
    try {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (err) {
      console.error("[account/delete] subscription cancel failed (may already be canceled):", err);
    }
  }

  if (subscription?.stripe_customer_id) {
    try {
      await stripe.customers.del(subscription.stripe_customer_id);
    } catch (err) {
      console.error("[account/delete] customer delete failed (may already be deleted):", err);
    }
  }

  if (userEmail) {
    try {
      await dbRun(
        `INSERT INTO trial_claims (id, email) VALUES (?, ?)
         ON CONFLICT(email) DO NOTHING`,
        createId(), userEmail,
      );
    } catch (err) {
      console.error("[account/delete] trial claim upsert failed:", err);
    }
  }

  // FK CASCADE on user_id deletes sessions/subscriptions/likes/views/etc.
  // SQLite enforces FKs only when PRAGMA foreign_keys=ON per session, which
  // D1 doesn't persist — so explicitly clean dependent rows first.
  await dbRun(`DELETE FROM subscriptions WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM sessions WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM post_likes WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM post_views WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM ai_search_logs WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM push_subscriptions WHERE user_id = ?`, userId);
  await dbRun(`DELETE FROM users WHERE id = ?`, userId);

  return NextResponse.json({ ok: true, refundedCents });
}

async function issueProratedRefund(
  stripe: Stripe,
  sub: Stripe.Subscription
): Promise<number> {
  if (sub.status !== "active" && sub.status !== "past_due") return 0;

  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
    | undefined;
  if (!item?.current_period_start || !item?.current_period_end) return 0;

  const periodStartMs = item.current_period_start * 1000;
  const periodEndMs = item.current_period_end * 1000;
  const nowMs = Date.now();

  const totalMs = periodEndMs - periodStartMs;
  const unusedMs = periodEndMs - nowMs;
  if (totalMs <= 0 || unusedMs <= 0) return 0;

  const invoices = await stripe.invoices.list({
    subscription: sub.id,
    status: "paid",
    limit: 1,
  });
  const latest = invoices.data[0] as
    | (Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null })
    | undefined;
  if (!latest || !latest.amount_paid || latest.amount_paid <= 0) return 0;

  const paymentIntentId =
    typeof latest.payment_intent === "string"
      ? latest.payment_intent
      : latest.payment_intent?.id;
  if (!paymentIntentId) return 0;

  const amount = Math.floor(latest.amount_paid * (unusedMs / totalMs));
  if (amount <= 0) return 0;

  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
  });

  return amount;
}
