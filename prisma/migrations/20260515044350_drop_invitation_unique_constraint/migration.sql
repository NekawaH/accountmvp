-- DropIndex
DROP INDEX "WorkspaceInvitation_workspaceId_toUserId_key";

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_toUserId_idx" ON "WorkspaceInvitation"("workspaceId", "toUserId");
