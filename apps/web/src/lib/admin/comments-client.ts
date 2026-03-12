import type { AdminCommentFeed } from "@/lib/post-comments";

export async function fetchAdminComments(query = ""): Promise<AdminCommentFeed> {
  const response = await fetch(`/internal-api/admin/comments${query}`);
  if (!response.ok) {
    throw new Error(`failed to fetch admin comments: ${response.status}`);
  }
  return (await response.json()) as AdminCommentFeed;
}

export async function deleteAdminComment(commentId: string): Promise<void> {
  const response = await fetch(`/internal-api/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`failed to delete comment: ${response.status}`);
  }
}
