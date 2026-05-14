'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Invitation {
  id: string
  status: string
  createdAt: string
  workspace: { id: string; name: string }
  from: { username: string; avatarUrl: string }
}

export default function MessagesPage() {
  const router = useRouter()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/messages')
      .then(r => r.ok ? r.json() : [])
      .then(setInvitations)
      .finally(() => setLoading(false))
  }, [])

  async function respond(id: string, action: 'accept' | 'decline') {
    setResponding(id)
    const res = await fetch(`/api/messages/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      setInvitations(prev => prev.filter(inv => inv.id !== id))
      if (action === 'accept') {
        const inv = invitations.find(i => i.id === id)
        if (inv) router.push(`/users/${inv.from.username}/workspace/${inv.workspace.id}`)
      }
    }
    setResponding(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-8">Loading…</p>
        ) : invitations.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-gray-400 text-sm">No pending invitations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map(inv => (
              <div key={inv.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm flex items-center gap-4">
                {inv.from.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={inv.from.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className="font-semibold">{inv.from.username}</span>
                    {' '}invited you to collaborate on{' '}
                    <span className="font-semibold">{inv.workspace.name}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => respond(inv.id, 'accept')}
                    disabled={responding === inv.id}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                  >Accept</button>
                  <button
                    onClick={() => respond(inv.id, 'decline')}
                    disabled={responding === inv.id}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-lg font-medium transition-colors"
                  >Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
