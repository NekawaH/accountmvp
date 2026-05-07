import { getSession } from '@/lib/session'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export default async function Home() {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center">
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          👤
        </div>
        <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
        <p className="text-gray-500 mb-6">{user?.email}</p>
        {!user?.emailVerified && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Your email is not verified. Check your inbox.
          </div>
        )}
        <Link
          href="/ide"
          className="block w-full py-2.5 px-4 mb-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-center transition-colors"
        >
          Open Pseudocode IDE
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
