import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { recordVersion } from '@/lib/fileVersions'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const source = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { files: true },
  })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!source.isPublic) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const forked = await prisma.$transaction(async tx => {
    const ws = await tx.workspace.create({
      data: {
        userId: session.userId,
        name: `Fork of ${source.name}`,
        isPublic: false,
        forkedFromId: source.id,
        files: {
          create: source.files.map(f => ({ name: f.name, content: f.content })),
        },
      },
      include: { files: true },
    })
    // Seed each forked file with a single baseline version, attributed to the
    // forker. We intentionally do NOT copy source history into the fork.
    for (const f of ws.files) {
      await recordVersion(f.id, f.content, session.userId, 'Forked', tx)
    }
    return ws
  })

  return NextResponse.json({ id: forked.id }, { status: 201 })
}
