import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { recordVersion } from '@/lib/fileVersions'
import { NextRequest, NextResponse } from 'next/server'

async function getFile(userId: string, fileId: string) {
  return prisma.pseudoFile.findFirst({
    where: { id: fileId, workspace: { userId } },
  })
}

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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Allow unauthenticated read if file belongs to a public workspace
  const file = await prisma.pseudoFile.findUnique({
    where: { id: params.id },
    include: { workspace: { select: { isPublic: true, userId: true } } },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!file.workspace.isPublic) {
    const session = await getSession()
    if (!session || session.userId !== file.workspace.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const { workspace: _, ...fileData } = file
  return NextResponse.json(fileData)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await canEditFile(session.userId, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { content, message } = await req.json()
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  const trimmedMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : null

  const updated = await prisma.$transaction(async tx => {
    const file = await tx.pseudoFile.update({
      where: { id: params.id },
      data: { content },
    })
    await recordVersion(file.id, content, session.userId, trimmedMessage, tx)
    return file
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await canEditFile(session.userId, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.pseudoFile.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
