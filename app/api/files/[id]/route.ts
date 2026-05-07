import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

async function getFile(session: { userId: string }, fileId: string) {
  return prisma.pseudoFile.findFirst({
    where: { id: fileId, userId: session.userId },
  })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const file = await getFile(session, params.id)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(file)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await getFile(session, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { content } = await req.json()
  const updated = await prisma.pseudoFile.update({
    where: { id: params.id },
    data: { content },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await getFile(session, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.pseudoFile.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
