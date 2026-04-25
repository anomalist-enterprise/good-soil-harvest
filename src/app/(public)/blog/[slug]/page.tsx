import { dbFirst, dbRun, type PostRow, type SubscriptionRow, fromBit, toDate, createId, nowISO } from "@/lib/db";
import { notFound } from "next/navigation";

// Hydrate a PostRow from D1 (snake_case) into the camelCase shape used by
// the rest of this file. Keeps the existing template untouched.
function hydratePost(r: PostRow) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    content: r.content,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    featuredImage: r.featured_image,
    references: r.refs,
    status: r.status,
    publishedAt: toDate(r.published_at),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  };
}
import { niches } from "@/lib/config";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { auth } from "@/auth";
import type { Metadata } from "next";
import { LikeButton } from "@/components/LikeButton";
import { BlogAd } from "@/components/ads/BlogAd";
import { ReadingProgress } from "@/components/ReadingProgress";
import Image from "next/image";

const nicheMap = Object.fromEntries(niches.map((n) => [n.slug, n]));

const SITE = process.env.NEXTAUTH_URL ?? "https://goodsoilharvest.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await dbFirst<PostRow>(`SELECT * FROM posts WHERE slug = ?`, slug);
  if (!row) return {};
  const post = hydratePost(row);

  const url = `${SITE}/blog/${post.slug}`;
  const ogImage = `${SITE}/api/og?title=${encodeURIComponent(post.title)}&niche=${encodeURIComponent(post.niche)}`;

  return {
    title: post.title,
    description: post.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description ?? undefined,
      url,
      siteName: "Good Soil Harvest",
      publishedTime: post.publishedAt?.toISOString(),
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description ?? undefined,
      images: [ogImage],
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await dbFirst<PostRow>(
    `SELECT * FROM posts WHERE slug = ? AND status = ?`,
    slug, "PUBLISHED",
  );
  if (!row) notFound();
  const post = hydratePost(row);

  const niche = nicheMap[post.niche];

  // ── Access control ─────────────────────────────────────────────────────────
  // Free posts: visible to all
  // isPremium posts: requires SEEDLING or DEEP_ROOTS active subscription
  // isDeepRoots posts: requires DEEP_ROOTS active subscription
  let accessGranted = true;
  let isLiked = false;
  let viewerPlan: "FREE" | "SEEDLING" | "DEEP_ROOTS" | "ADMIN" = "FREE";
  const session = await auth();
  const userId = session?.user?.id;

  if (session?.user?.role === "ADMIN") {
    viewerPlan = "ADMIN";
  } else if (userId) {
    const sub = await dbFirst<SubscriptionRow>(
      `SELECT plan, status FROM subscriptions WHERE user_id = ?`, userId,
    );
    if (sub?.status === "ACTIVE") {
      if (sub.plan === "DEEP_ROOTS") viewerPlan = "DEEP_ROOTS";
      else if (sub.plan === "SEEDLING") viewerPlan = "SEEDLING";
    }
  }

  if (post.isPremium || post.isDeepRoots) {
    if (viewerPlan === "ADMIN" || viewerPlan === "DEEP_ROOTS") {
      accessGranted = true;
    } else if (post.isPremium && !post.isDeepRoots && viewerPlan === "SEEDLING") {
      accessGranted = true;
    } else {
      accessGranted = false;
    }
  }

  // Track view + check like status for authenticated users
  if (userId && accessGranted) {
    const [like] = await Promise.all([
      dbFirst<{ id: string }>(
        `SELECT id FROM post_likes WHERE user_id = ? AND post_id = ?`,
        userId, post.id,
      ),
      // Upsert: insert or bump viewed_at on conflict
      dbRun(
        `INSERT INTO post_views (id, user_id, post_id, viewed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, post_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
        createId(), userId, post.id, nowISO(),
      ),
    ]);
    isLiked = !!like;
  }

  // Related posts — same niche, different post, max 3
  const relatedRows = await (async () => {
    const { dbAll } = await import("@/lib/db");
    return dbAll<Pick<PostRow, "slug" | "title" | "description" | "featured_image" | "niche" | "is_premium" | "is_deep_roots">>(
      `SELECT slug, title, description, featured_image, niche, is_premium, is_deep_roots
       FROM posts
       WHERE niche = ? AND status = ? AND id != ?
       ORDER BY published_at DESC
       LIMIT 3`,
      post.niche, "PUBLISHED", post.id,
    );
  })();
  const relatedPosts = relatedRows.map(r => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    featuredImage: r.featured_image,
    niche: r.niche,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
  }));

  return (
    <>
    <ReadingProgress />
    <div className="max-w-[var(--max-w-prose)] mx-auto px-4 sm:px-6 py-14">
      {/* Back to feed (signed-in) or breadcrumb (signed-out) */}
      {userId ? (
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--color-sage-600)] transition-colors inline-flex items-center gap-1"
          >
            ← Back to my feed
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-8">
          <Link href="/blog" className="hover:text-[var(--foreground)] transition-colors">
            Blog
          </Link>
          <span className="opacity-40">›</span>
          <Link href={`/niches/${post.niche}`} className="hover:text-[var(--foreground)] transition-colors">
            {niche?.title ?? post.niche}
          </Link>
        </div>
      )}

      {/* Header */}
      <header className="mb-10">
        <Link href={`/niches/${post.niche}`}>
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-sage-500)] hover:text-[var(--color-harvest-500)] transition-colors">
            {niche?.icon} {niche?.title ?? post.niche}
          </span>
        </Link>
        {post.isDeepRoots && (
          <span className="ml-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-harvest-500)] border border-[var(--color-harvest-300)] rounded-full px-2 py-0.5">
            Deep Roots
          </span>
        )}
        {post.isPremium && !post.isDeepRoots && (
          <span className="ml-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-sage-500)] border border-[var(--color-sage-300)] rounded-full px-2 py-0.5">
            Premium
          </span>
        )}
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--foreground)] mt-3 mb-4 leading-tight">
          {post.title}
        </h1>
        <p className="text-lg text-[var(--text-muted)] leading-relaxed border-l-2 border-[var(--color-harvest-500)] pl-4">
          {post.description}
        </p>
        <p className="text-sm text-[var(--text-muted)] opacity-50 mt-5">
          {post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : ""}
        </p>
      </header>

      <hr className="border-[var(--border)] mb-10" />

      {post.featuredImage && (
        <div className="relative w-full h-72 sm:h-96 rounded-2xl overflow-hidden mb-10">
          <Image
            src={post.featuredImage}
            alt={post.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 800px"
            priority
          />
        </div>
      )}

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.publishedAt?.toISOString(),
            url: `${SITE}/blog/${post.slug}`,
            publisher: {
              "@type": "Organization",
              name: "Good Soil Harvest",
              url: SITE,
            },
            mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/blog/${post.slug}` },
          }),
        }}
      />

      {/* Ad — free articles only, non-subscribers only */}
      <BlogAd show={!post.isPremium && !post.isDeepRoots && viewerPlan === "FREE"} />

      {/* Content or paywall */}
      {accessGranted ? (
        <>
          <article className="prose text-[var(--foreground)]">
            <MDXRemote
              source={post.content}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                  rehypePlugins: [rehypeSlug],
                },
              }}
            />
          </article>

          {/* Bottom ad — free articles, non-subscribers */}
          <BlogAd show={!post.isPremium && !post.isDeepRoots && viewerPlan === "FREE"} />

          {post.references && (
            <div className="mt-10 pt-8 border-t border-[var(--border)]">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">References</h2>
              <div className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                {post.references}
              </div>
            </div>
          )}

          {userId && (
            <div className="mt-10 pt-8 border-t border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
              <LikeButton postId={post.id} initialLiked={isLiked} />
              <Link
                href="/dashboard"
                className="text-sm text-[var(--text-muted)] hover:text-[var(--color-sage-600)] transition-colors inline-flex items-center gap-1"
              >
                ← Back to my feed
              </Link>
            </div>
          )}
        </>
      ) : (
        <Paywall isDeepRoots={post.isDeepRoots} viewerPlan={viewerPlan} />
      )}

      {/* Related posts */}
      {relatedPosts.length > 0 && (
        <div className="mt-14 pt-10 border-t border-[var(--border)]">
          <h2 className="font-serif text-xl font-bold text-[var(--foreground)] mb-6 text-center">More in {niche?.title ?? post.niche}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {relatedPosts.map((rp) => (
              <Link
                key={rp.slug}
                href={`/blog/${rp.slug}`}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:border-[var(--color-sage-400)] transition-colors"
              >
                {rp.featuredImage && (
                  <div className="relative w-full h-28 overflow-hidden">
                    <Image src={rp.featuredImage} alt={rp.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 100vw, 33vw" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {rp.isDeepRoots && <span className="text-[10px] font-semibold text-[var(--color-harvest-600)]">🌾 Deep Roots</span>}
                    {rp.isPremium && !rp.isDeepRoots && <span className="text-[10px] font-semibold text-[var(--color-sage-600)]">🌱 Premium</span>}
                  </div>
                  <p className="text-sm font-serif font-bold text-[var(--foreground)] leading-snug group-hover:text-[var(--color-sage-600)] transition-colors line-clamp-2">
                    {rp.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

type ViewerPlan = "FREE" | "SEEDLING" | "DEEP_ROOTS" | "ADMIN";

function Paywall({ isDeepRoots, viewerPlan }: { isDeepRoots: boolean; viewerPlan: ViewerPlan }) {
  const isLoggedIn = viewerPlan !== "FREE" || false; // FREE viewerPlan can mean signed-out OR signed-in-no-sub
  // ^ We can't distinguish from this prop alone. The render below handles each case explicitly.
  const isSeedlingViewingDeepRoots = viewerPlan === "SEEDLING" && isDeepRoots;

  // Distinct copy + CTAs for each scenario
  let title: string;
  let body: string;
  let primaryHref: string;
  let primaryLabel: string;
  let showSignIn = false;

  if (isSeedlingViewingDeepRoots) {
    title = "🌾 Deep Roots Exclusive";
    body =
      "This article is part of Deep Roots — exclusive content twice a month, AI-powered search, and more. Upgrade from Seedling and you'll only pay the difference (or stay free if you're still on your trial).";
    primaryHref = "/account?upgrade=deep_roots";
    primaryLabel = "Upgrade to Deep Roots →";
  } else if (viewerPlan === "SEEDLING" || viewerPlan === "DEEP_ROOTS") {
    // Edge case — shouldn't normally hit (they have access). Show a generic billing link.
    title = isDeepRoots ? "Deep Roots Exclusive" : "Premium Content";
    body = "There's an issue with your subscription status. Please refresh, or visit your account.";
    primaryHref = "/account";
    primaryLabel = "Go to account →";
  } else {
    // Signed out OR signed in with no active subscription (FREE)
    title = isDeepRoots ? "🌾 Deep Roots Exclusive" : "🌱 Premium Content";
    body = isDeepRoots
      ? "This article is for Deep Roots members. Start a 7-day free trial — exclusive posts, AI search, and full access to everything."
      : "This article is for Seedling and Deep Roots members. Start a 7-day free trial to unlock all premium articles across every category.";
    primaryHref = isDeepRoots ? "/pricing#deep-roots" : "/pricing#seedling";
    primaryLabel = "Start free trial →";
    showSignIn = true;
  }

  return (
    <div className="text-center py-16 px-6">
      {/* Blurred teaser line */}
      <div className="relative mb-10 overflow-hidden rounded-xl">
        <div className="blur-sm select-none pointer-events-none space-y-3 px-4 py-6 bg-[var(--surface-muted)]">
          <div className="h-4 bg-[var(--border)] rounded w-full" />
          <div className="h-4 bg-[var(--border)] rounded w-5/6 mx-auto" />
          <div className="h-4 bg-[var(--border)] rounded w-4/6 mx-auto" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--background)]" />
      </div>

      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-harvest-100)] mb-5">
        <span className="text-2xl">{isDeepRoots ? "🌾" : "🌱"}</span>
      </div>

      <h2 className="font-serif text-2xl font-bold text-[var(--foreground)] mb-3">{title}</h2>
      <p className="text-[var(--text-muted)] max-w-md mx-auto mb-8">{body}</p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--color-harvest-500)] text-white font-semibold hover:bg-[var(--color-harvest-600)] transition-colors"
        >
          {primaryLabel}
        </Link>
        {showSignIn && (
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-muted)] font-semibold hover:border-[var(--color-sage-400)] transition-colors"
          >
            Already a member? Sign in
          </Link>
        )}
      </div>

      {/* Back to feed for signed-in users */}
      {viewerPlan !== "FREE" && (
        <div className="mt-8">
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--color-sage-600)] transition-colors"
          >
            ← Back to my feed
          </Link>
        </div>
      )}
    </div>
  );
}
