// Serves /.well-known/security.txt per RFC 9116.
// Next.js's static-asset pipeline skips dot-directories in public/, so this
// route handler is the canonical way to expose the file on App Router.
// Cloudflare Security Center requires this path on every active domain.

const SECURITY_TXT = `Contact: mailto:security@anomalistenterprise.com
Expires: 2027-05-11T00:00:00.000Z
Preferred-Languages: en
Canonical: https://goodsoilharvest.com/.well-known/security.txt
`;

export async function GET() {
  return new Response(SECURITY_TXT, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

// Static — no per-request work.
export const dynamic = "force-static";
