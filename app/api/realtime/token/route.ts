import { SignJWT } from 'jose'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.JWT_SECRET)

/**
 * Mint a short-lived token the browser can pass to the cross-origin WS
 * server. We can't rely on the httpOnly session cookie reaching the WS
 * upgrade (different origin/port in dev; SameSite=Lax doesn't reliably
 * include cookies on cross-origin WS handshakes). Same JWT_SECRET as
 * lib/session.ts so the WS server can verify with one secret.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await new SignJWT({ sub: session.userId, kind: 'realtime' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .setIssuedAt()
    .sign(secret)

  return NextResponse.json({ token })
}
