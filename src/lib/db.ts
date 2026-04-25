// Direct D1 helpers — replaces Prisma.
//
// Why: Prisma 7 + Neon adapter on Cloudflare Workers triggered runtime Wasm
// compilation which Workers blocks. Migrated off Prisma in Phase 2 of the
// CF migration. Schema lives in migrations/0001_init.sql.
//
// Usage:
//   import { db, dbAll, dbFirst, dbRun } from "@/lib/db";
//   const posts = await dbAll<Post>("SELECT * FROM posts WHERE status = ?", "PUBLISHED");
//
// Conventions:
// - Schema column names are snake_case. Helper types below mirror them.
// - Booleans round-trip as 0/1 (CHECK constraints enforce in schema).
// - Dates are ISO 8601 strings; helpers below provide toDate() to parse.
// - id columns: callers generate via createId() (cuid2) at insert time.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createId } from "@paralleldrive/cuid2";

export { createId };

/** Get the D1 binding from the runtime context. */
export function db() {
  return getCloudflareContext().env.DB;
}

/** Run a SELECT, return all rows (typed). */
export async function dbAll<T = unknown>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const stmt = db().prepare(sql);
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  const res = await bound.all<T>();
  return (res.results || []) as T[];
}

/** Run a SELECT, return first row or null. */
export async function dbFirst<T = unknown>(sql: string, ...binds: unknown[]): Promise<T | null> {
  const stmt = db().prepare(sql);
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  return (await bound.first<T>()) ?? null;
}

/** Run an INSERT/UPDATE/DELETE. Returns meta (changes, last_row_id, etc). */
export async function dbRun(sql: string, ...binds: unknown[]): Promise<D1Result> {
  const stmt = db().prepare(sql);
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  return bound.run();
}

/** Execute multiple statements in a single batch (atomic on D1). */
export async function dbBatch(stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  return db().batch(stmts);
}

/** Build a prepared statement (use when you need to compose batch). */
export function dbPrepare(sql: string) {
  return db().prepare(sql);
}

// ─── Type helpers ───────────────────────────────────────────────────────────
// Row shapes mirror migrations/0001_init.sql. Use these instead of Prisma's
// generated types. Booleans return as 0/1; convert at boundary.

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: "ADMIN" | "SUBSCRIBER" | "READER";
  email_verified: 0 | 1;
  verify_token: string | null;
  verify_token_exp: string | null;
  reset_token: string | null;
  reset_token_exp: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "FREE" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  plan: "SEEDLING" | "DEEP_ROOTS" | null;
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  niche: "faith" | "finance" | "psychology" | "philosophy" | "science";
  is_premium: 0 | 1;
  is_deep_roots: 0 | 1;
  featured_image: string | null;
  refs: string | null;
  status: "DRAFT" | "APPROVED" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentDraftRow {
  id: string;
  title: string;
  description: string;
  content: string;
  niche: "faith" | "finance" | "psychology" | "philosophy" | "science";
  is_premium: 0 | 1;
  is_deep_roots: 0 | 1;
  featured_image: string | null;
  refs: string | null;
  agent_name: string;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  email: string | null;
  message: string;
  type: "BUG" | "FEATURE" | "COMMENT" | "QUESTION";
  status: "NEW" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  ai_summary: string | null;
  ai_priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  ai_tags: string | null;
  ai_triaged_at: string | null;
  user_agent: string | null;
  page_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Convenience ───────────────────────────────────────────────────────────

/** ISO 8601 string at "now" — same shape as datetime('now') default. */
export function nowISO(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Convert an ISO/SQL datetime string to JS Date, null-safe. */
export function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // SQLite default uses "YYYY-MM-DD HH:MM:SS"; ISO adds a 'T'. Both parseable.
  const normalized = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert a JS bool to D1 storage value (0/1). */
export function toBit(b: boolean | null | undefined): 0 | 1 | null {
  if (b === null || b === undefined) return null;
  return b ? 1 : 0;
}

/** Convert D1 stored 0/1 (or null) to JS boolean. */
export function fromBit(v: 0 | 1 | null | undefined): boolean {
  return v === 1;
}
