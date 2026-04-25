import type { MetadataRoute } from "next";
import { dbAll, toDate } from "@/lib/db";

const SITE = "https://www.goodsoilharvest.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/blog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/niches/faith`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/niches/finance`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/niches/psychology`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/niches/philosophy`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/niches/science`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/disclaimer`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const posts = await dbAll<{ slug: string; published_at: string | null; updated_at: string }>(
      `SELECT slug, published_at, updated_at FROM posts WHERE status = ?`,
      "PUBLISHED",
    );
    const postRoutes: MetadataRoute.Sitemap = posts.map(p => ({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: toDate(p.updated_at) ?? toDate(p.published_at) ?? undefined,
      changeFrequency: "monthly",
      priority: 0.6,
    }));
    return [...staticRoutes, ...postRoutes];
  } catch {
    return staticRoutes;
  }
}
