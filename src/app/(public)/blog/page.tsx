import { dbAll, type PostRow, toDate, fromBit } from "@/lib/db";
import type { Metadata } from "next";
import BlogClient from "./BlogClient";

export const metadata: Metadata = {
  title: "Blog",
  description: "All posts from Good Soil Harvest — faith, finance, psychology, philosophy, and science.",
};

export default async function BlogPage() {
  const rows = await dbAll<Pick<PostRow, "id" | "title" | "slug" | "description" | "niche" | "is_premium" | "is_deep_roots" | "published_at" | "featured_image">>(
    `SELECT id, title, slug, description, niche, is_premium, is_deep_roots, published_at, featured_image
     FROM posts
     WHERE status = ?
     ORDER BY is_premium ASC, published_at DESC`,
    "PUBLISHED",
  );

  // Transform snake_case D1 rows → camelCase shape expected by BlogClient
  const posts = rows.map(r => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description ?? null,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    publishedAt: toDate(r.published_at),
    featuredImage: r.featured_image,
  }));

  return (
    <div className="max-w-[var(--max-w-content)] mx-auto px-4 sm:px-6 py-14">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-4xl font-bold text-[var(--foreground)]">All Posts</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Faith, finance, psychology, philosophy, and science.
        </p>
      </div>

      <BlogClient posts={posts} />
    </div>
  );
}
