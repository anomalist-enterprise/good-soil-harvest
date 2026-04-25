import { notFound } from "next/navigation";
import { dbFirst, type PostRow, fromBit, toDate } from "@/lib/db";
import PostEditClient from "./PostEditClient";

export default async function PostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const post = await dbFirst<PostRow>(`SELECT * FROM posts WHERE id = ?`, id);
  if (!post) notFound();

  return (
    <PostEditClient
      post={{
        id: post.id,
        slug: post.slug,
        title: post.title,
        description: post.description,
        content: post.content,
        niche: post.niche,
        isPremium: fromBit(post.is_premium),
        status: post.status,
        publishedAt: toDate(post.published_at)?.toISOString() ?? null,
        updatedAt: (toDate(post.updated_at) ?? new Date()).toISOString(),
      }}
    />
  );
}
