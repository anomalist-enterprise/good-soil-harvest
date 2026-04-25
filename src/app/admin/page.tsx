import Link from "next/link";
import { dbFirst } from "@/lib/db";

export default async function AdminDashboard() {
  const [draftsRow, publishedRow, totalRow] = await Promise.all([
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM agent_drafts WHERE status = ?`, "PENDING"),
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM posts WHERE status = ?`, "PUBLISHED"),
    dbFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM posts`),
  ]);
  const pendingDrafts = draftsRow?.n ?? 0;
  const publishedPosts = publishedRow?.n ?? 0;
  const totalPosts = totalRow?.n ?? 0;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-white">CMS Dashboard</h1>
        <p className="text-white/50 mt-1">Manage posts and review agent drafts.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <p className="text-sm text-white/50 font-medium">Pending Drafts</p>
          <p className="font-serif text-4xl font-bold text-[var(--color-harvest-400)] mt-1">{pendingDrafts}</p>
          <Link href="/admin/drafts" className="text-sm text-[var(--color-sage-400)] hover:text-white transition-colors mt-2 inline-block">
            Review →
          </Link>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <p className="text-sm text-white/50 font-medium">Published Posts</p>
          <p className="font-serif text-4xl font-bold text-white mt-1">{publishedPosts}</p>
          <Link href="/admin/posts" className="text-sm text-[var(--color-sage-400)] hover:text-white transition-colors mt-2 inline-block">
            View all →
          </Link>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <p className="text-sm text-white/50 font-medium">Total Posts</p>
          <p className="font-serif text-4xl font-bold text-white mt-1">{totalPosts}</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/drafts"
            className="px-4 py-2 rounded-lg bg-[var(--color-harvest-500)] text-[var(--color-soil-900)] text-sm font-semibold hover:bg-[var(--color-harvest-400)] transition-colors"
          >
            Review Drafts ({pendingDrafts})
          </Link>
          <Link
            href="/admin/posts/new"
            className="px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Write New Post
          </Link>
          <Link
            href="/admin/feedback"
            className="px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Feedback
          </Link>
          <Link
            href="/admin/settings"
            className="px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Settings
          </Link>
        </div>
      </div>
    </>
  );
}
