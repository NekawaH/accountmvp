import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// Search users by username prefix
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const users = await prisma.user.findMany({
    where: { username: { contains: q, mode: 'insensitive' } },
    select: { username: true, avatarUrl: true },
    take: 10,
  })
  return NextResponse.json(users)
}
