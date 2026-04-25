import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { dbAll, dbFirst, type PostRow, type UserRow, type SubscriptionRow, fromBit, toDate } from "@/lib/db";
import { getSuggestions, getLikedPosts, getViewedPosts } from "@/lib/suggestions";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const [user, sub] = await Promise.all([
    dbFirst<Pick<UserRow, "role">>(`SELECT role FROM users WHERE id = ?`, userId),
    dbFirst<Pick<SubscriptionRow, "status" | "plan" | "trial_end">>(
      `SELECT status, plan, trial_end FROM subscriptions WHERE user_id = ?`, userId,
    ),
  ]);

  const isAdmin = user?.role === "ADMIN";
  const isPaid = isAdmin || sub?.status === "ACTIVE";
  const isDeepRoots = isAdmin || (isPaid && sub?.plan === "DEEP_ROOTS");
  const plan = isAdmin ? "DEEP_ROOTS" : ((sub?.plan as string | null) ?? null);

  const [suggestions, liked, history, totalRow] = await Promise.all([
    isPaid ? getSuggestions(userId) : Promise.resolve([]),
    isPaid ? getLikedPosts(userId)  : Promise.resolve([]),
    isPaid ? getViewedPosts(userId) : Promise.resolve([]),
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM posts WHERE status = ?`, "PUBLISHED"),
  ]);
  const totalPosts = totalRow?.n ?? 0;

  const browseRows = await dbAll<Pick<PostRow, "id" | "slug" | "title" | "description" | "niche" | "is_premium" | "is_deep_roots" | "published_at" | "featured_image">>(
    `SELECT id, slug, title, description, niche, is_premium, is_deep_roots, published_at, featured_image
     FROM posts
     WHERE status = ?
     ORDER BY published_at DESC
     LIMIT 24`,
    "PUBLISHED",
  );
  const browse = browseRows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    publishedAt: toDate(r.published_at),
    featuredImage: r.featured_image,
  }));

  const trialEndDate = toDate(sub?.trial_end ?? null);

  return (
    <DashboardClient
      userId={userId}
      plan={plan}
      isPaid={isPaid}
      isDeepRoots={isDeepRoots}
      suggestions={suggestions}
      liked={liked}
      history={history}
      browse={browse}
      totalPosts={totalPosts}
      trialEnd={trialEndDate ? trialEndDate.toISOString() : null}
    />
  );
}
