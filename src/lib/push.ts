import { dbAll } from "@/lib/db";

// ⚠ web-push (the npm package) uses Node crypto and won't run on Cloudflare
// Workers' edge runtime. This module's `notifyNewPosts` is currently a no-op
// when invoked from a Worker handler — it logs the would-be sends and exits.
// Port to Web Crypto (RFC 8291 + RFC 8188 aes128gcm + ES256 JWT) following
// the same pattern Maximus uses (see maximus-thomas/src/worker.js sendWebPush).
// Tracked as Phase 3 of the Cloudflare migration; not blocking the cutover.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";

interface NotifyNewPostsOpts {
  posts: Array<{ title: string; niche: string; slug: string }>;
}

/**
 * Send batched push notifications for newly published posts. Currently
 * a soft no-op on Cloudflare Workers — see top-of-file note. Subscribers
 * are still loaded so the call shape is preserved for when we port to
 * Web Crypto.
 */
export async function notifyNewPosts({ posts }: NotifyNewPostsOpts) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || posts.length === 0) return;

  const allSubs = await dbAll<{ id: string; endpoint: string; p256dh: string; auth: string; niches: string }>(
    `SELECT id, endpoint, p256dh, auth, niches FROM push_subscriptions WHERE niches != ''`,
  );

  let wouldSend = 0;
  for (const sub of allSubs) {
    const userNiches = sub.niches.split(",").filter(Boolean);
    const matchingPosts = posts.filter((p) => userNiches.includes(p.niche));
    if (matchingPosts.length === 0) continue;
    wouldSend++;
  }

  if (wouldSend > 0) {
    console.warn(`[push] would notify ${wouldSend} subscribers but web-push is disabled on edge — port to Web Crypto to re-enable`);
  }
}
