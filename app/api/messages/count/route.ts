import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ count: 0 })

  const count = await prisma.workspaceInvitation.count({
    where: { toUserId: session.userId, status: 'PENDING' },
  })

  return NextResponse.json({ count })
}
