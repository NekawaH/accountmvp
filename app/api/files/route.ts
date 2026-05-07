import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const files = await prisma.pseudoFile.findMany({
    where: { userId: session.userId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(files)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, content } = await req.json()
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }
  if (!/^[\w\- ]+\.(psc|txt)$/.test(name)) {
    return NextResponse.json({ error: 'Name must end in .psc or .txt' }, { status: 400 })
  }

  const file = await prisma.pseudoFile.upsert({
    where: { userId_name: { userId: session.userId, name } },
    create: { userId: session.userId, name, content: content ?? '' },
    update: { content: content ?? '' },
  })
  return NextResponse.json(file)
}
