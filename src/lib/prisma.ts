// PRISMA STUB — Phase 2 of CF migration removed Prisma in favor of raw D1.
// Any code still importing this gets a runtime error pointing at the call
// site so we know what's left to migrate. This file should eventually be
// deleted once every Prisma reference is rewritten to @/lib/db.
//
// See migrations/0001_init.sql for the SQLite schema and src/lib/db.ts
// for the helpers.

// Typed as `any` so TS-checks pass for not-yet-migrated routes. Runtime
// access still throws clearly, so unconverted routes fail loudly at request
// time (and never under the home/blog/auth code paths we've already migrated).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new Proxy({}, {
  get(_, prop) {
    throw new Error(
      `[migration] Prisma was removed. Rewrite this call site (prisma.${String(prop)}) to use @/lib/db with raw D1 SQL.`
    );
  },
});
