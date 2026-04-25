import { NextRequest, NextResponse } from "next/server";
import { dbAll, dbFirst, type UserRow, type SubscriptionRow, type PostRow } from "@/lib/db";

// Machine-to-machine endpoint — uses AGENT_API_SECRET bearer token (same as /api/agent)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_API_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().replace("T", " ").slice(0, 19);

  const [users, postCounts, draftCounts, totalViewsRow, totalLikesRow, aiLogs, imageRow] =
    await Promise.all([
      dbAll<UserRow & {
        sub_status: SubscriptionRow["status"] | null;
        sub_plan: SubscriptionRow["plan"] | null;
        sub_period_end: string | null;
        sub_trial_end: string | null;
      }>(
        `SELECT u.*, s.status AS sub_status, s.plan AS sub_plan,
                s.current_period_end AS sub_period_end, s.trial_end AS sub_trial_end
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
         ORDER BY u.created_at DESC`,
      ),
      dbAll<{ status: PostRow["status"]; n: number }>(
        `SELECT status, COUNT(*) AS n FROM posts GROUP BY status`,
      ),
      dbAll<{ status: string; n: number }>(
        `SELECT status, COUNT(*) AS n FROM agent_drafts GROUP BY status`,
      ),
      dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM post_views`),
      dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM post_likes`),
      dbAll<{ user_id: string; input_tokens: number; output_tokens: number; created_at: string }>(
        `SELECT user_id, input_tokens, output_tokens, created_at
         FROM ai_search_logs
         WHERE created_at >= ?
         ORDER BY created_at DESC`,
        thirtyDaysAgoISO,
      ),
      dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM posts WHERE featured_image IS NOT NULL`),
    ]);

  const totalViews = totalViewsRow?.n ?? 0;
  const totalLikes = totalLikesRow?.n ?? 0;
  const imageCount = imageRow?.n ?? 0;

  // Hydrate users to the shape the original endpoint returned
  const usersOut = users.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
    emailVerified: u.email_verified === 1,
    createdAt: u.created_at,
    subscription: u.sub_status ? {
      status: u.sub_status,
      plan: u.sub_plan,
      currentPeriodEnd: u.sub_period_end,
      trialEnd: u.sub_trial_end,
    } : null,
  }));

  // Haiku 4.5 pricing: $0.80/M input, $4.00/M output
  const totalInput = aiLogs.reduce((s, l) => s + l.input_tokens, 0);
  const totalOutput = aiLogs.reduce((s, l) => s + l.output_tokens, 0);
  const estimatedCostUsd = parseFloat(
    (totalInput * 0.0000008 + totalOutput * 0.000004).toFixed(6)
  );

  const imageCostPerUnit = 0.0028;
  const imageCostEst = parseFloat((imageCount * imageCostPerUnit).toFixed(4));

  return NextResponse.json({
    users: usersOut,
    posts: Object.fromEntries(postCounts.map(r => [r.status, r.n])),
    drafts: Object.fromEntries(draftCounts.map(r => [r.status, r.n])),
    engagement: { totalViews, totalLikes },
    aiSearch: {
      calls30d: aiLogs.length,
      inputTokens30d: totalInput,
      outputTokens30d: totalOutput,
      estimatedCostUsd,
      recent: aiLogs.slice(0, 25).map(r => ({
        userId: r.user_id,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        createdAt: r.created_at,
      })),
    },
    images: {
      totalGenerated: imageCount,
      costPerImage: imageCostPerUnit,
      estimatedCostUsd: imageCostEst,
    },
    generatedAt: new Date().toISOString(),
  });
}
