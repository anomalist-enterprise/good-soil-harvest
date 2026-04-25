import Link from "next/link";
import { dbAll, type AgentDraftRow, fromBit } from "@/lib/db";

const nicheLabel: Record<string, string> = {
  faith: "Faith",
  finance: "Finance",
  psychology: "Psychology",
  philosophy: "Philosophy",
  science: "Science & Tech",
};

const statusColors: Record<string, string> = {
  PENDING:  "bg-yellow-900/30 text-yellow-300",
  APPROVED: "bg-green-900/30 text-green-400",
  REJECTED: "bg-red-900/30 text-red-400",
  EDITED:   "bg-blue-900/30 text-blue-300",
};

export default async function DraftsPage() {
  const rows = await dbAll<AgentDraftRow>(
    `SELECT * FROM agent_drafts ORDER BY status ASC, created_at DESC`,
  );
  const drafts = rows.map(r => ({
    ...r,
    isPremium: fromBit(r.is_premium),
    isDeepRoots: fromBit(r.is_deep_roots),
    agentName: r.agent_name,
  }));

  const pending = drafts.filter((d) => d.status === "PENDING");
  const reviewed = drafts.filter((d) => d.status !== "PENDING");

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white">
            Agent Drafts
          </h1>
          <p className="text-white/60 mt-1">
            {pending.length} pending review
          </p>
        </div>
      </div>

      {pending.length === 0 && (
        <div className="bg-[var(--color-soil-800)] rounded-xl p-8 text-center border border-white/10 mb-8">
          <span className="text-4xl block mb-3">✓</span>
          <p className="text-white/60">All caught up — no drafts pending.</p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-10">
          <h2 className="font-semibold text-white/50 mb-3 uppercase text-xs tracking-widest">
            Pending Review
          </h2>
          <div className="space-y-3">
            {pending.map((draft) => (
              <Link
                key={draft.id}
                href={`/admin/drafts/${draft.id}`}
                className="block bg-[var(--color-soil-800)] rounded-xl p-5 border border-[var(--color-harvest-700)/30] hover:border-[var(--color-harvest-500)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-sage-400)]">
                        {nicheLabel[draft.niche] ?? draft.niche}
                      </span>
                      {draft.isPremium && (
                        <span className="text-xs bg-[var(--color-harvest-900)/40] text-[var(--color-harvest-400)] px-2 py-0.5 rounded-full font-medium">
                          Premium
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif text-lg font-bold text-white truncate">
                      {draft.title}
                    </h3>
                    <p className="text-sm text-white/60 mt-1 line-clamp-2">
                      {draft.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[draft.status]}`}>
                      {draft.status}
                    </span>
                    <p className="text-xs text-white/40 mt-2">
                      by {draft.agentName}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h2 className="font-semibold text-white/50 mb-3 uppercase text-xs tracking-widest">
            Previously Reviewed
          </h2>
          <div className="space-y-2">
            {reviewed.map((draft) => (
              <Link
                key={draft.id}
                href={`/admin/drafts/${draft.id}`}
                className="flex items-center justify-between bg-[var(--color-soil-800)] rounded-xl px-5 py-3 border border-white/10 hover:border-white/20 transition-colors"
              >
                <span className="text-sm font-medium text-white/70 truncate">
                  {draft.title}
                </span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ml-4 ${statusColors[draft.status]}`}>
                  {draft.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
