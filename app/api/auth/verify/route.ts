import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing-token', process.env.NEXT_PUBLIC_APP_URL!))
  }

  const user = await prisma.user.findUnique({ where: { verifyToken: token } })

  if (!user || !user.verifyTokenExp || user.verifyTokenExp < new Date()) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', process.env.NEXT_PUBLIC_APP_URL!))
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
  })

  return NextResponse.redirect(new URL('/login?verified=1', process.env.NEXT_PUBLIC_APP_URL!))
}
