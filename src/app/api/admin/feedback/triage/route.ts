import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbAll, dbRun, type FeedbackRow, nowISO } from "@/lib/db";
import { sendFeedbackAlert } from "@/lib/email";

// On-demand AI triage of un-triaged feedback. Called when admin opens
// the feedback page. Uses Haiku for cost-efficient summarization.
export async function POST() {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const untriaged = await dbAll<FeedbackRow>(
    `SELECT * FROM feedback WHERE ai_triaged_at IS NULL ORDER BY created_at ASC LIMIT 30`,
  );

  if (untriaged.length === 0) {
    return NextResponse.json({ triaged: 0 });
  }

  // Build a single batch request — way cheaper than per-item calls
  const numbered = untriaged
    .map(
      (f, i) =>
        `[${i + 1}] type=${f.type} from=${f.email ?? "anonymous"} page=${f.page_url ?? "?"}\n${f.message}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are triaging user feedback for the Good Soil Harvest blog (faith, finance, psychology, philosophy, science). For each feedback item, output a JSON object with:
- "summary": a one-sentence summary (max 120 chars)
- "priority": one of CRITICAL, HIGH, MEDIUM, LOW
- "tags": array of short tags like "bug", "blocking", "paywall", "ux", "content-request", "auth", "billing", "duplicate", "positive", "spam"

Priority guide:
- CRITICAL: payment broken, can't sign in, account locked, data loss, security
- HIGH: bug affecting many users, top-requested feature, broken core flow
- MEDIUM: useful improvement, non-blocking bug, content suggestion
- LOW: nice-to-have, minor polish, off-topic, positive comment

Output ONLY a JSON array of objects in order, one per item. No prose, no markdown fence.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: numbered }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: "Anthropic API error", detail: errText.slice(0, 500) },
      { status: 502 }
    );
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";

  // Strip any accidental markdown fences and parse
  const cleaned = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();

  let parsed: Array<{ summary: string; priority: string; tags: string[] }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[feedback/triage] failed to parse AI response:", text.slice(0, 500));
    return NextResponse.json(
      { error: "Failed to parse triage response" },
      { status: 502 }
    );
  }

  if (!Array.isArray(parsed) || parsed.length !== untriaged.length) {
    return NextResponse.json(
      { error: `AI returned ${parsed?.length ?? 0} items, expected ${untriaged.length}` },
      { status: 502 }
    );
  }

  const validPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const now = nowISO();

  await Promise.all(
    untriaged.map((item, i) => {
      const t = parsed[i];
      const priority = validPriorities.includes(t.priority) ? t.priority : "MEDIUM";
      const tags = Array.isArray(t.tags) ? t.tags.join(",") : "";
      return dbRun(
        `UPDATE feedback SET ai_summary = ?, ai_priority = ?, ai_tags = ?, ai_triaged_at = ?, status = 'TRIAGED' WHERE id = ?`,
        t.summary?.slice(0, 200) ?? null, priority, tags, now, item.id,
      );
    })
  );

  const urgent = parsed
    .map((t, i) => ({ ...t, ...untriaged[i] }))
    .filter(t => t.priority === "CRITICAL" || t.priority === "HIGH");
  if (urgent.length > 0) {
    sendFeedbackAlert(
      urgent.map(u => ({
        summary: u.summary?.slice(0, 200) ?? "No summary",
        priority: u.priority,
        email: u.email,
        message: u.message,
        pageUrl: u.page_url,
      }))
    ).catch(err => console.error("[feedback/triage] alert email failed:", err));
  }

  return NextResponse.json({ triaged: untriaged.length });
}
