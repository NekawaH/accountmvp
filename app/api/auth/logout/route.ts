import { destroySession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function POST() {
  destroySession()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))
}
