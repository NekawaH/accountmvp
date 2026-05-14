import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const workspaces = await prisma.workspace.findMany({
    where: { isPublic: true, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true, user: { select: { username: true, avatarUrl: true } } },
    take: 10,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(workspaces)
}
