import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const verifyToken = crypto.randomBytes(32).toString('hex')
  const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await prisma.user.create({
    data: { email, passwordHash, verifyToken, verifyTokenExp },
  })

  await sendVerificationEmail(email, verifyToken)

  return NextResponse.json({ ok: true }, { status: 201 })
}
