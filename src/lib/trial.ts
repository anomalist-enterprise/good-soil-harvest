import { dbFirst } from "@/lib/db";

/**
 * Returns true if the user's email has NOT yet claimed a free trial.
 *
 * - Signed-out viewers (no email) are treated as eligible — they haven't
 *   yet given us an email to compare. Marketing copy stays broad.
 * - Signed-in viewers are checked against trial_claims; one claim per email,
 *   ever. Same rule the checkout API enforces server-side.
 */
export async function isTrialEligible(email: string | null | undefined): Promise<boolean> {
  if (!email) return true;
  const claim = await dbFirst<{ email: string }>(
    `SELECT email FROM trial_claims WHERE email = ?`,
    email.toLowerCase(),
  );
  return !claim;
}
