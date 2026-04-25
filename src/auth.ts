import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { dbFirst, dbRun, type UserRow, type SubscriptionRow } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import authConfig from "./auth.config";

// auth.ts: full NextAuth setup. Migrated off Prisma to raw D1 in Phase 2 of
// the Cloudflare migration (Prisma 7 + Workers triggered runtime Wasm
// compilation which Workers blocks). Used by API routes, server components,
// and the auth handlers. The proxy/middleware runs on the edge runtime and
// uses auth.config directly to avoid pulling in this module's DB deps.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        loginToken: { label: "Login Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const emailLower = (credentials.email as string).trim().toLowerCase();

        // Throttle brute-force attempts at a specific account. 10 tries per 15
        // minutes per email. Login tokens bypass this since they're single-use
        // post-verification and already expire in 5 minutes.
        if (!credentials.loginToken) {
          const limit = await rateLimit({
            action: "signin",
            identifier: emailLower,
            max: 10,
            windowSeconds: 60 * 15,
          });
          if (!limit.ok) {
            // NextAuth authorize() can only return null/user — it can't return
            // a 429. Returning null here forces the client to show "invalid
            // credentials" which is the correct UX for a blocked attacker.
            return null;
          }
        }

        // User + subscription in a single LEFT JOIN
        const row = await dbFirst<UserRow & {
          sub_plan: SubscriptionRow["plan"];
          sub_status: SubscriptionRow["status"];
        }>(
          `SELECT u.*, s.plan AS sub_plan, s.status AS sub_status
           FROM users u
           LEFT JOIN subscriptions s ON s.user_id = u.id
           WHERE u.email = ?`,
          emailLower,
        );

        if (!row) return null;

        // One-time login token path (post-email-verification auto-login)
        if (credentials.loginToken) {
          const tokenMatches = row.verify_token === (credentials.loginToken as string);
          const expMs = row.verify_token_exp ? Date.parse(row.verify_token_exp.replace(" ", "T") + "Z") : 0;
          const tokenValid = tokenMatches && expMs > Date.now();
          if (!row.verify_token || !tokenValid) return null;
          await dbRun(
            `UPDATE users SET verify_token = NULL, verify_token_exp = NULL WHERE id = ?`,
            row.id,
          );
        } else {
          // Normal password path
          if (!credentials.password || !row.password_hash) return null;
          const valid = await bcrypt.compare(
            credentials.password as string,
            row.password_hash,
          );
          if (!valid) return null;
        }

        return {
          id: row.id,
          email: row.email ?? "",
          role: row.role as string,
          subscriptionPlan: row.sub_plan ?? null,
          subscriptionStatus: row.sub_status ?? null,
        };
      },
    }),
  ],
  // pages, session, cookies, callbacks all live in auth.config.ts via the
  // ...authConfig spread above.
});
