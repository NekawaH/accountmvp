import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { recordVersion } from '@/lib/fileVersions'
import { NextRequest, NextResponse } from 'next/server'

/** Same write-auth rule as PUT /api/files/[id]. */
async function canEditFile(userId: string, fileId: string) {
  const file = await prisma.pseudoFile.findUnique({
    where: { id: fileId },
    select: { workspaceId: true, workspace: { select: { userId: true } } },
  })
  if (!file) return null
  if (file.workspace.userId === userId) return file
  const collab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId } },
  })
  return collab ? file : null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canEditFile(session.userId, params.id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const target = await prisma.fileVersion.findFirst({
    where: { id: params.versionId, fileId: params.id },
    select: { id: true, content: true, createdAt: true },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const shortId = target.id.slice(-6)
  const stamp = target.createdAt.toISOString().replace('T', ' ').slice(0, 16)
  const message = `Restored from ${shortId} @ ${stamp}`

  const result = await prisma.$transaction(async tx => {
    await tx.pseudoFile.update({
      where: { id: params.id },
      data: { content: target.content },
    })
    return recordVersion(params.id, target.content, session.userId, message, tx)
  })

  return NextResponse.json({ ok: true, version: result, content: target.content })
}
