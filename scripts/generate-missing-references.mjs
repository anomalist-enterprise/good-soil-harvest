// Generate 3 canonical references for posts that don't have any, using
// Sonnet 4.6 with structured outputs. Plain text only (no URLs) so a wrong
// guess can't show up as a broken link. Idempotent — only touches rows
// where refs is NULL/empty.
//
// Run:
//   set -a; source /Users/chris/scripts/cloudflare.env; set +a
//   set -a; source /Users/chris/Documents/projects/good-soil-harvest/.env; set +a
//   bun scripts/generate-missing-references.mjs

import Anthropic from "@anthropic-ai/sdk";

const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID_PERSONAL || process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN =
  process.env.CLOUDFLARE_API_TOKEN_PERSONAL || process.env.CLOUDFLARE_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DB_ID = "7c399e0b-7e25-40e5-bc79-25e2924eddfb";

if (!ACCOUNT_ID || !API_TOKEN || !ANTHROPIC_KEY) {
  console.error(
    "Missing env: need CLOUDFLARE_ACCOUNT_ID_PERSONAL, CLOUDFLARE_API_TOKEN_PERSONAL, ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function d1(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(`D1: ${JSON.stringify(data.errors)}`);
  return data.result[0].results;
}

const SYSTEM = `You generate reference lists for educational blog posts. For each article, identify exactly 3 canonical, well-established works (primary sources, seminal papers, or standard textbooks) that an informed reader would cite for this topic.

Format each reference EXACTLY like this — plain text, no URLs, no markdown links:
"¹ Author First Last — *Title* (year), publisher"
"² Author First Last — *Title* (year), publisher"
"³ Author First Last — *Title* (year), publisher"

Use the unicode superscript digits ¹ ² ³ as the prefix. Italicize the title with single asterisks. Include the year in parentheses and the publisher.

Only cite well-known canonical sources you can confidently identify. Do NOT fabricate works, ISBNs, or attributions. If you cannot confidently produce 3 canonical references for the topic, return fewer rather than guessing.`;

async function generateRefs(post) {
  const userMsg = `Title: ${post.title}\nNiche: ${post.niche}\n\nArticle excerpt (first 1500 chars):\n${post.content.slice(0, 1500)}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            references: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["references"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: userMsg }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return [];
  try {
    const parsed = JSON.parse(textBlock.text);
    return Array.isArray(parsed.references) ? parsed.references : [];
  } catch {
    return [];
  }
}

async function main() {
  const posts = await d1(
    `SELECT id, slug, title, niche, content FROM posts
     WHERE status='PUBLISHED' AND (refs IS NULL OR refs='')
     ORDER BY published_at DESC`
  );

  console.log(`Found ${posts.length} posts missing references. Generating with Sonnet 4.6...\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of posts) {
    try {
      const refs = await generateRefs(p);
      if (refs.length === 0) {
        console.log(`⚠️  no refs returned: ${p.title.slice(0, 70)}`);
        skipped++;
        continue;
      }
      const refsText = refs.join("\n");
      await d1(`UPDATE posts SET refs = ?, updated_at = ? WHERE id = ?`, [
        refsText,
        new Date().toISOString().replace("T", " ").slice(0, 19),
        p.id,
      ]);
      console.log(`✅ [${p.niche.padEnd(11)}] ${p.title.slice(0, 65)} (${refs.length} refs)`);
      updated++;
    } catch (err) {
      console.error(`❌ ${p.title}: ${err.message}`);
      failed++;
    }
    // Light pacing so we don't burst into rate limits.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `\nDone. updated=${updated} skipped=${skipped} failed=${failed} total=${posts.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
