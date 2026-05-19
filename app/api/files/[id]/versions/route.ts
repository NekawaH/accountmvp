import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

/** Reuse the read-auth rule from GET /api/files/[id]: allow if workspace is public, otherwise require session user to own or collaborate on the workspace. */
async function canReadFile(fileId: string) {
  const file = await prisma.pseudoFile.findUnique({
    where: { id: fileId },
    include: { workspace: { select: { isPublic: true, userId: true } } },
  })
  if (!file) return null
  if (file.workspace.isPublic) return file
  const session = await getSession()
  if (!session) return null
  if (session.userId === file.workspace.userId) return file
  const collab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: session.userId } },
  })
  return collab ? file : null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const file = await canReadFile(params.id)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const versions = await prisma.fileVersion.findMany({
    where: { fileId: params.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      message: true,
      createdAt: true,
      author: { select: { username: true, avatarUrl: true } },
    },
  })
  return NextResponse.json(versions)
}
