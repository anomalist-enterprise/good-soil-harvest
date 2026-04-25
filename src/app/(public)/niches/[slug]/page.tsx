import { dbAll, type PostRow, fromBit, toDate } from "@/lib/db";
import { niches } from "@/lib/config";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const niche = niches.find((n) => n.slug === slug);
  if (!niche) return {};
  return { title: niche.title, description: niche.description };
}

export default async function NichePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const niche = niches.find((n) => n.slug === slug);
  if (!niche) notFound();

  const rows = await dbAll<PostRow>(
    `SELECT * FROM posts WHERE niche = ? AND status = ? ORDER BY published_at DESC`,
    niche.slug, "PUBLISHED",
  );
  const posts = rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    featuredImage: r.featured_image,
    publishedAt: toDate(r.published_at),
  }));

  return (
    <div className="max-w-[var(--max-w-content)] mx-auto px-4 sm:px-6 py-14">
      {/* Niche header */}
      <div className="mb-12 text-center">
        <span className="text-5xl block mb-4">{niche.icon}</span>
        <h1 className="font-serif text-4xl font-bold text-[var(--foreground)]">{niche.title}</h1>
        <p className="mt-2 text-lg text-[var(--text-muted)] max-w-xl mx-auto">{niche.description}</p>
      </div>

      {posts.length === 0 ? (
        <p className="text-[var(--text-muted)]">No posts yet in this topic — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-[var(--surface)] rounded-2xl overflow-hidden border border-[var(--border)] hover:border-[var(--color-sage-400)] transition-colors shadow-sm"
            >
              {post.featuredImage && (
                <div className="relative w-full h-44">
                  <Image
                    src={post.featuredImage}
                    alt={post.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              )}
              <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                {post.isDeepRoots && (
                  <span className="text-xs font-semibold text-[var(--color-harvest-600)] border border-[var(--color-harvest-300)] rounded-full px-2 py-0.5">
                    🌾 Deep Roots
                  </span>
                )}
                {post.isPremium && !post.isDeepRoots && (
                  <span className="text-xs font-semibold text-[var(--color-sage-600)] border border-[var(--color-sage-300)] rounded-full px-2 py-0.5">
                    🌱 Premium
                  </span>
                )}
              </div>
              <h2 className="font-serif text-xl font-bold text-[var(--foreground)] mb-2 leading-snug">
                <Link href={`/blog/${post.slug}`} className="hover:text-[var(--color-sage-600)] transition-colors">
                  {post.title}
                </Link>
              </h2>
              <p className="text-sm text-[var(--text-muted)] line-clamp-3 mb-4">{post.description}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)] opacity-60">
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
                </p>
                <Link href={`/blog/${post.slug}`} className="text-sm font-semibold text-[var(--color-sage-600)] hover:text-[var(--color-harvest-600)] transition-colors">
                  {post.isPremium || post.isDeepRoots ? "Preview →" : "Read →"}
                </Link>
              </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
