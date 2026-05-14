import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'

const ADJECTIVES = ['swift','brave','calm','bold','keen','bright','cool','dark','fair','glad','gold','grey','iron','jade','kind','lime','mint','navy','oak','pine','red','rose','sage','sky','star','teal','warm','wild','wise','zeal']
const NOUNS = ['wolf','hawk','bear','fox','lynx','crow','deer','dove','duck','eagle','elk','fawn','fish','frog','goat','hare','kite','lamb','lark','lion','mole','moth','newt','owl','puma','rook','seal','slug','swan','toad']

function generateUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(100 + Math.random() * 900)
  return `${adj}_${noun}_${num}`
}

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

  // Generate a unique username
  let username = generateUsername()
  while (await prisma.user.findUnique({ where: { username } })) {
    username = generateUsername()
  }

  // Default avatar via DiceBear (stored as a URL)
  const avatarUrl = `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(username)}`

  await prisma.user.create({
    data: { email, passwordHash, emailVerified: true, username, avatarUrl },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
