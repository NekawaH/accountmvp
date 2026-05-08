import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, username: true, avatarUrl: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username, avatarUrl } = await req.json()
  const data: Record<string, string> = {}

  if (username !== undefined) {
    const trimmed = username.trim()
    if (!trimmed || !/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
      return NextResponse.json({ error: 'Username must be 3–30 characters (letters, numbers, underscores)' }, { status: 400 })
    }
    const conflict = await prisma.user.findUnique({ where: { username: trimmed } })
    if (conflict && conflict.id !== session.userId) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    data.username = trimmed
  }

  if (avatarUrl !== undefined) {
    data.avatarUrl = avatarUrl
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { email: true, username: true, avatarUrl: true },
  })
  return NextResponse.json(updated)
}
