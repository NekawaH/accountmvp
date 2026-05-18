-- Index to speed up "list workspaces I collaborate on" (dashboard "Collaborating"
-- section). The existing @@unique([workspaceId, userId]) has userId as the
-- second column, so a WHERE userId = $1 lookup couldn't use it and degenerated
-- into a full table scan. The new index is ordered by joinedAt DESC to also
-- satisfy the ORDER BY on the query.
CREATE INDEX "WorkspaceCollaborator_userId_joinedAt_idx"
  ON "WorkspaceCollaborator" ("userId", "joinedAt");
