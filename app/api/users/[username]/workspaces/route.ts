import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: { username: string } }) {
  const user = await prisma.user.findUnique({ where: { username: params.username } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id, isPublic: true },
    select: { id: true, name: true, createdAt: true, _count: { select: { forks: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(workspaces)
}
