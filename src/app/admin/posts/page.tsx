import Link from "next/link";
import { dbAll, type PostRow, fromBit, toDate } from "@/lib/db";
import { findDuplicates } from "@/lib/duplicates";

const nicheLabel: Record<string, string> = {
  faith: "Faith",
  finance: "Finance",
  psychology: "Psychology",
  philosophy: "Philosophy",
  science: "Science & Tech",
};

const statusColors: Record<string, string> = {
  DRAFT:     "bg-gray-700/30 text-gray-300",
  APPROVED:  "bg-blue-900/30 text-blue-300",
  PUBLISHED: "bg-green-900/30 text-green-400",
  REJECTED:  "bg-red-900/30 text-red-400",
  ARCHIVED:  "bg-yellow-900/30 text-yellow-300",
};

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; niche?: string }>;
}) {
  const { status, niche } = await searchParams;

  const filters: string[] = [];
  const binds: unknown[] = [];
  if (status) { filters.push(`status = ?`); binds.push(status); }
  if (niche)  { filters.push(`niche = ?`);  binds.push(niche); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await dbAll<PostRow>(
    `SELECT * FROM posts ${where} ORDER BY status ASC, updated_at DESC`,
    ...binds,
  );
  const posts = rows.map(r => ({
    ...r,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    publishedAt: toDate(r.published_at),
    updatedAt: toDate(r.updated_at) ?? new Date(),
  }));

  // Compute duplicates across ALL posts so the flag shows up regardless of filter
  const allPosts = await dbAll<{ id: string; title: string; niche: string }>(
    `SELECT id, title, niche FROM posts ORDER BY created_at ASC`,
  );
  const dupeMap = findDuplicates(allPosts);

  const countRows = await dbAll<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM posts GROUP BY status`,
  );
  const countMap = Object.fromEntries(countRows.map(c => [c.status, c.n]));
  const total = posts.length;

  const statuses = ["PUBLISHED", "APPROVED", "DRAFT", "ARCHIVED", "REJECTED"];

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white">
            Posts
          </h1>
          <p className="text-white/60 mt-1">
            {total} {status ? status.toLowerCase() : "total"} posts
          </p>
        </div>
        <Link
          href="/admin/posts/new"
          className="bg-[var(--color-harvest-500)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--color-harvest-600)] transition-colors"
        >
          + New Post
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/admin/posts"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !status
              ? "bg-[var(--color-soil-700)] text-white"
              : "bg-[var(--color-soil-800)] border border-white/10 text-white/60 hover:border-white/30"
          }`}
        >
          All ({Object.values(countMap).reduce((a, b) => a + b, 0)})
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/posts?status=${s}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === s
                ? "bg-[var(--color-soil-800)] text-white"
                : "bg-white border border-[var(--color-sage-200)] text-[var(--color-soil-600)] hover:border-[var(--color-sage-400)]"
            }`}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()} ({countMap[s] ?? 0})
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="bg-[var(--color-soil-800)] rounded-xl p-12 text-center border border-white/10">
          <span className="text-4xl block mb-3">📝</span>
          <p className="text-[var(--color-soil-600)]">No posts found.</p>
          <Link href="/admin/posts/new" className="text-sm text-[var(--color-sage-600)] underline mt-2 inline-block">
            Create one
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const dupe = dupeMap.get(post.id);
            return (
              <Link
                key={post.id}
                href={`/admin/posts/${post.id}`}
                className={`flex items-center justify-between bg-[var(--color-soil-800)] rounded-xl px-5 py-4 border transition-colors group ${
                  dupe
                    ? "border-yellow-700/50 hover:border-yellow-600/70"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-sage-600)]">
                      {nicheLabel[post.niche] ?? post.niche}
                    </span>
                    {post.isPremium && (
                      <span className="text-xs bg-[var(--color-harvest-100)] text-[var(--color-harvest-700)] px-2 py-0.5 rounded-full font-medium">
                        Premium
                      </span>
                    )}
                    {dupe && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-0.5 rounded-full font-medium" title={`Shares topic word "${dupe.matchedWord}" with: "${dupe.matchTitle}"`}>
                        ⚠ Possible duplicate
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif font-bold text-[var(--color-soil-800)] truncate group-hover:text-[var(--color-harvest-600)] transition-colors">
                    {post.title}
                  </h3>
                  {dupe && (
                    <p className="text-xs text-yellow-700 mt-0.5 truncate">
                      Topic &ldquo;{dupe.matchedWord}&rdquo; also in: &ldquo;{dupe.matchTitle}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-soil-400)] mt-0.5">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : `Updated ${new Date(post.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusColors[post.status]}`}>
                  {post.status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
