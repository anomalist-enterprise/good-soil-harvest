import { notFound } from "next/navigation";
import { auth } from "@/auth";
import DraftReviewClient from "./DraftReviewClient";
import { dbFirst, type AgentDraftRow, fromBit, toDate } from "@/lib/db";

export default async function DraftReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const draft = await dbFirst<AgentDraftRow>(`SELECT * FROM agent_drafts WHERE id = ?`, id);
  if (!draft) notFound();

  return (
    <DraftReviewClient
      draft={{
        id: draft.id,
        title: draft.title,
        description: draft.description,
        content: draft.content,
        niche: draft.niche,
        isPremium: fromBit(draft.is_premium),
        isDeepRoots: fromBit(draft.is_deep_roots),
        featuredImage: draft.featured_image,
        references: draft.refs,
        agentName: draft.agent_name,
        notes: draft.notes,
        status: draft.status,
        createdAt: (toDate(draft.created_at) ?? new Date()).toISOString(),
      }}
      adminEmail={session?.user?.email ?? ""}
    />
  );
}
