import { NextRequest, NextResponse } from "next/server";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { dbFirst, dbRun, createId, nowISO } from "@/lib/db";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: only ack-as-duplicate when the prior handler ran to
  // completion (completed_at set). If a previous run inserted the row but
  // crashed before finishing, completed_at stays NULL — re-run the handler;
  // every db op below is an idempotent UPSERT/UPDATE, so it's safe.
  const seen = await dbFirst<{ completed_at: string | null }>(
    `SELECT completed_at FROM webhook_events WHERE stripe_event_id = ?`,
    event.id,
  );
  if (seen?.completed_at) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (!seen) {
    try {
      await dbRun(
        `INSERT INTO webhook_events (stripe_event_id, event_type) VALUES (?, ?)`,
        event.id, event.type,
      );
    } catch (err) {
      // SQLITE_CONSTRAINT — concurrent insert lost the race. Fall through to
      // run the handler; the eventual UPDATE completed_at is idempotent.
      console.warn("[webhooks/stripe] insert race:", err);
    }
  }

  try {
    switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      let userId = session.metadata?.userId;
      const plan = session.metadata?.plan as "SEEDLING" | "DEEP_ROOTS" | undefined;
      const customerId = session.customer as string;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      if (!subscriptionId) break;

      if (!userId) {
        const customer = await stripe.customers.retrieve(customerId);
        const email = "deleted" in customer ? null : customer.email;
        if (email) {
          const u = await dbFirst<{ id: string }>(`SELECT id FROM users WHERE email = ?`, email);
          userId = u?.id;
        }
      }
      if (!userId) break;

      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      const periodEndISO = periodEndISOFromSub(stripeSub);
      const trialEndISO = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString().replace("T", " ").slice(0, 19) : null;

      // Pin the customer's default PM to the one that actually paid for this
      // session. Defends against Link / portal drift where the customer's
      // invoice_settings.default_payment_method points at a stale card.
      try {
        const piId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
        let pmId: string | null = null;
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(piId);
          pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
        }
        if (!pmId) {
          const subPm = stripeSub.default_payment_method;
          pmId = typeof subPm === "string" ? subPm : subPm?.id ?? null;
        }
        if (pmId) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: pmId },
          });
          await stripe.subscriptions.update(subscriptionId, {
            default_payment_method: pmId,
          });
        }
      } catch (err) {
        console.warn("[webhooks/stripe] default PM sync failed:", err);
      }

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
        createId(), userId, customerId, subscriptionId, plan ?? "SEEDLING",
        periodEndISO, trialEndISO, nowISO(), nowISO(),
      );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planFromPriceId(priceId) ?? (sub.metadata?.plan as "SEEDLING" | "DEEP_ROOTS" | undefined);
      const status = stripeStatusToDb(sub.status);
      const periodEndISO = periodEndISOFromSub(sub);
      const trialEndISO = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().replace("T", " ").slice(0, 19) : null;

      if (plan) {
        await dbRun(
          `UPDATE subscriptions SET status = ?, current_period_end = ?, trial_end = ?, plan = ? WHERE stripe_subscription_id = ?`,
          status, periodEndISO, trialEndISO, plan, sub.id,
        );
      } else {
        await dbRun(
          `UPDATE subscriptions SET status = ?, current_period_end = ?, trial_end = ? WHERE stripe_subscription_id = ?`,
          status, periodEndISO, trialEndISO, sub.id,
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await dbRun(
        `UPDATE subscriptions SET status = 'CANCELED', plan = NULL, current_period_end = NULL WHERE stripe_subscription_id = ?`,
        sub.id,
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await dbRun(
          `UPDATE subscriptions SET status = 'PAST_DUE' WHERE stripe_subscription_id = ?`,
          subscriptionId,
        );
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        await dbRun(
          `UPDATE subscriptions SET status = 'ACTIVE', current_period_end = ? WHERE stripe_subscription_id = ?`,
          periodEndISOFromSub(stripeSub), subscriptionId,
        );
      }
      break;
    }
    }
  } catch (err) {
    // Handler crashed after the idempotency row was inserted (or after a
    // duplicate-row fall-through). Do NOT set completed_at — Stripe will
    // retry the event and the re-run will find completed_at = NULL and
    // re-execute the handler (every db op below the INSERT is idempotent).
    console.error(
      `[webhooks/stripe] HANDLER CRASH event=${event.id} type=${event.type}:`,
      err,
    );
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  await dbRun(
    `UPDATE webhook_events SET completed_at = ? WHERE stripe_event_id = ?`,
    nowISO(), event.id,
  );

  return NextResponse.json({ received: true });
}

function periodEndISOFromSub(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (!item) return null;
  const ts = (item as Stripe.SubscriptionItem & { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19) : null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

function stripeStatusToDb(status: Stripe.Subscription["status"]) {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE" as const;
    case "past_due":
      return "PAST_DUE" as const;
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "CANCELED" as const;
    default:
      return "FREE" as const;
  }
}
