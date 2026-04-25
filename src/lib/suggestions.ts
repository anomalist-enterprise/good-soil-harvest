import { dbAll, type PostRow, fromBit, toDate } from "@/lib/db";

export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  niche: string;
  isPremium: boolean;
  isDeepRoots: boolean;
  publishedAt: Date | null;
  featuredImage: string | null;
};

type PostSelectRow = Pick<PostRow, "id" | "slug" | "title" | "description" | "niche" | "is_premium" | "is_deep_roots" | "published_at" | "featured_image">;

function hydrate(r: PostSelectRow): PostSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    publishedAt: toDate(r.published_at),
    featuredImage: r.featured_image,
  };
}

const POST_SELECT_SQL =
  "p.id, p.slug, p.title, p.description, p.niche, p.is_premium, p.is_deep_roots, p.published_at, p.featured_image";

/** Posts the user has liked, most recent first */
export async function getLikedPosts(userId: string): Promise<PostSummary[]> {
  const rows = await dbAll<PostSelectRow>(
    `SELECT ${POST_SELECT_SQL}
     FROM post_likes l
     JOIN posts p ON p.id = l.post_id
     WHERE l.user_id = ?
     ORDER BY l.liked_at DESC`,
    userId,
  );
  return rows.map(hydrate);
}

/** Posts the user has viewed, most recent first */
export async function getViewedPosts(userId: string, limit = 20): Promise<PostSummary[]> {
  const rows = await dbAll<PostSelectRow>(
    `SELECT ${POST_SELECT_SQL}
     FROM post_views v
     JOIN posts p ON p.id = v.post_id
     WHERE v.user_id = ?
     ORDER BY v.viewed_at DESC
     LIMIT ?`,
    userId, limit,
  );
  return rows.map(hydrate);
}

/**
 * Personalised "For You" suggestions.
 * Weighs niches based on likes (×3) + recent views (×1),
 * then returns up to `limit` unread published posts sorted by that weight.
 * Falls back to latest posts when there's no history.
 */
export async function getSuggestions(userId: string, limit = 12): Promise<PostSummary[]> {
  const [likeNiches, viewNiches] = await Promise.all([
    dbAll<{ niche: string; post_id: string }>(
      `SELECT p.niche, l.post_id
       FROM post_likes l JOIN posts p ON p.id = l.post_id
       WHERE l.user_id = ?`,
      userId,
    ),
    dbAll<{ niche: string; post_id: string }>(
      `SELECT p.niche, v.post_id
       FROM post_views v JOIN posts p ON p.id = v.post_id
       WHERE v.user_id = ?
       ORDER BY v.viewed_at DESC
       LIMIT 50`,
      userId,
    ),
  ]);

  const nicheWeights: Record<string, number> = {};
  for (const l of likeNiches) nicheWeights[l.niche] = (nicheWeights[l.niche] ?? 0) + 3;
  for (const v of viewNiches) nicheWeights[v.niche] = (nicheWeights[v.niche] ?? 0) + 1;

  const seenIds = new Set([...likeNiches.map(l => l.post_id), ...viewNiches.map(v => v.post_id)]);

  // No way to bind an array to a SQL `IN` clause directly with D1; build placeholders.
  const placeholders = seenIds.size > 0 ? Array(seenIds.size).fill("?").join(",") : null;
  const sql = placeholders
    ? `SELECT ${POST_SELECT_SQL.replace(/p\./g, "")}
       FROM posts p
       WHERE p.status = ? AND p.id NOT IN (${placeholders})
       ORDER BY p.published_at DESC`
    : `SELECT ${POST_SELECT_SQL.replace(/p\./g, "")}
       FROM posts p
       WHERE p.status = ?
       ORDER BY p.published_at DESC`;
  const binds: unknown[] = ["PUBLISHED", ...(placeholders ? [...seenIds] : [])];
  const unreadRows = await dbAll<PostSelectRow>(sql, ...binds);
  const unread = unreadRows.map(hydrate);

  if (Object.keys(nicheWeights).length === 0) return unread.slice(0, limit);

  return unread
    .sort((a, b) => (nicheWeights[b.niche] ?? 0) - (nicheWeights[a.niche] ?? 0))
    .slice(0, limit);
}
