'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ReceivedInvitation {
  id: string
  status: string
  seenByTo: boolean
  createdAt: string
  workspace: { id: string; name: string }
  from: { username: string; avatarUrl: string }
}

interface SentInvitation {
  id: string
  status: string
  seenByFrom: boolean
  createdAt: string
  workspace: { id: string; name: string }
  to: { username: string; avatarUrl: string }
}

export default function NoticesPage() {
  const router = useRouter()
  const [received, setReceived] = useState<ReceivedInvitation[]>([])
  const [sent, setSent] = useState<SentInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (initial = false) =>
      fetch('/api/messages')
        .then(r => r.ok ? r.json() : { received: [], sent: [] })
        .then(data => {
          if (cancelled) return
          setReceived(data.received ?? [])
          setSent(data.sent ?? [])
        })
        .catch(() => {})
        .finally(() => { if (initial && !cancelled) setLoading(false) })

    load(true)
    const interval = setInterval(() => load(), 15000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function respond(id: string, action: 'accept' | 'decline') {
    setResponding(id)
    const res = await fetch(`/api/messages/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      setReceived(prev => prev.map(inv => inv.id === id ? { ...inv, status: action === 'accept' ? 'ACCEPTED' : 'DECLINED' } : inv))
      if (action === 'accept') {
        const inv = received.find(i => i.id === id)
        if (inv) router.push(`/users/${inv.from.username}/workspace/${inv.workspace.id}`)
      }
    }
    setResponding(null)
  }

  const isEmpty = received.length === 0 && sent.length === 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Notices</h1>
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-8">Loading…</p>
        ) : isEmpty ? (
          <div className="text-center mt-16">
            <p className="text-gray-400 text-sm">No notices.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {received.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invitations</h2>
                {received.map(inv => (
                  <div key={inv.id} className={`bg-white border rounded-xl px-5 py-4 shadow-sm flex items-center gap-4 ${inv.status === 'REMOVED' && !inv.seenByTo ? 'border-blue-300' : 'border-gray-200'}`}>
                    {inv.from.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={inv.from.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">
                          <span className="font-semibold">{inv.from.username}</span>
                          {inv.status === 'REMOVED'
                            ? <>{' '}removed you from <span className="font-semibold">{inv.workspace.name}</span></>
                            : <>{' '}invited you to collaborate on <span className="font-semibold">{inv.workspace.name}</span></>
                          }
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                      </div>
                      {inv.status === 'REMOVED' && !inv.seenByTo && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      )}
                    </div>
                    {inv.status === 'PENDING' ? (
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
                    ) : (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                        inv.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                        inv.status === 'REMOVED' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {inv.status === 'ACCEPTED' ? 'Accepted' : inv.status === 'REMOVED' ? 'Removed' : 'Declined'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sent.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sent Invitations</h2>
                {sent.map(inv => (
                  <div key={inv.id} className={`bg-white border rounded-xl px-5 py-4 shadow-sm flex items-center gap-4 ${!inv.seenByFrom ? 'border-blue-300' : 'border-gray-200'}`}>
                    {inv.to.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={inv.to.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">
                          <span className="font-semibold">{inv.to.username}</span>
                          {' '}{inv.status === 'ACCEPTED' ? 'accepted' : 'declined'} your invitation to{' '}
                          <span className="font-semibold">{inv.workspace.name}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                      </div>
                      {!inv.seenByFrom && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                      inv.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {inv.status === 'ACCEPTED' ? 'Accepted' : 'Declined'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
