'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface UserProfile { username: string; avatarUrl: string }
interface Workspace { id: string; name: string; createdAt: string; _count: { forks: number } }

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${username}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/users/${username}/workspaces`).then(r => r.ok ? r.json() : []),
    ]).then(([p, ws]) => {
      if (!p) { setNotFound(true) } else { setProfile(p); setWorkspaces(ws) }
      setLoading(false)
    })
  }, [username])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-gray-400">Loading…</p></div>

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-3">User not found.</p>
        <button onClick={() => router.push('/')} className="text-blue-600 hover:underline text-sm">← Home</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        {/* Back */}
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700 mb-8 block">← Back</button>

        {/* Profile header */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 mb-6">
          {profile?.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={profile.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
            : <div className="w-16 h-16 rounded-full bg-gray-200" />}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile?.username}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{workspaces.length} public workspace{workspaces.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Public workspaces */}
        {workspaces.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-8">No public workspaces yet.</p>
        ) : (
          <div className="space-y-2">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                onClick={() => router.push(`/users/${username}/workspace/${ws.id}`)}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm hover:border-blue-300 hover:shadow transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">{ws.name}</p>
                  {ws._count.forks > 0 && <span className="text-xs text-gray-400">⑂ {ws._count.forks}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Created {new Date(ws.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
