import { auth } from "@/auth";
import { dbFirst, type UserRow, type SubscriptionRow, toDate } from "@/lib/db";
import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?redirect=/account");

  const [user, sub] = await Promise.all([
    dbFirst<UserRow>(`SELECT * FROM users WHERE id = ?`, session.user.id),
    dbFirst<SubscriptionRow>(`SELECT * FROM subscriptions WHERE user_id = ?`, session.user.id),
  ]);

  const isAdmin = user?.role === "ADMIN";
  const memberSince = toDate(user?.created_at ?? null);
  const periodEnd = toDate(sub?.current_period_end ?? null);
  const trialEnd = toDate(sub?.trial_end ?? null);

  return (
    <AccountClient
      userId={session.user.id}
      email={session.user.email ?? ""}
      memberSince={memberSince ? memberSince.toISOString() : null}
      plan={isAdmin ? "DEEP_ROOTS" : (sub?.plan ?? null)}
      status={isAdmin ? "ACTIVE" : (sub?.status ?? "FREE")}
      currentPeriodEnd={isAdmin ? null : (periodEnd ? periodEnd.toISOString() : null)}
      trialEnd={isAdmin ? null : (trialEnd ? trialEnd.toISOString() : null)}
      isAdmin={isAdmin}
    />
  );
}
