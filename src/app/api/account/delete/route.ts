import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email?.toLowerCase() ?? null;

  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const stripe = getStripe();

  let refundedCents = 0;

  if (subscription?.stripeSubscriptionId) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      refundedCents = await issueProratedRefund(stripe, stripeSub);
    } catch (err) {
      console.error("[account/delete] refund path failed:", err);
    }

    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (err) {
      console.error("[account/delete] subscription cancel failed (may already be canceled):", err);
    }
  }

  if (subscription?.stripeCustomerId) {
    try {
      await stripe.customers.del(subscription.stripeCustomerId);
    } catch (err) {
      console.error("[account/delete] customer delete failed (may already be deleted):", err);
    }
  }

  if (userEmail) {
    try {
      await prisma.trialClaim.upsert({
        where: { email: userEmail },
        create: { email: userEmail },
        update: {},
      });
    } catch (err) {
      console.error("[account/delete] trial claim upsert failed:", err);
    }
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    console.error("[account/delete] user delete failed (table=user):", err);
    return NextResponse.json(
      { error: "Account deletion failed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, refundedCents });
}

// Prorated refund for the unused portion of the current billing period.
// Returns cents refunded, or 0 if no refund applied.
async function issueProratedRefund(
  stripe: Stripe,
  sub: Stripe.Subscription
): Promise<number> {
  // Both "active" and "past_due" users have paid for a period that may still
  // be unused. Skip trialing (no charge) and canceled/incomplete (already over).
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
