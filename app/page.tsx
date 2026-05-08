'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Workspace { id: string; name: string; createdAt: string; isPublic: boolean }
interface Profile { username: string; avatarUrl: string }
interface UserResult { username: string; avatarUrl: string }

export default function DashboardPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Search
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/workspaces').then(r => r.ok ? r.json() : []).then(setWorkspaces).finally(() => setLoading(false))
    fetch('/api/profile').then(r => r.ok ? r.json() : null).then(setProfile)
  }, [])

  // Debounced user search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchQ.trim().length < 2) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQ.trim())}`)
      setSearchResults(res.ok ? await res.json() : [])
      setSearching(false)
    }, 300)
  }, [searchQ])

  async function createWorkspace() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError('')
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setCreating(false)
    if (res.ok) {
      const ws: Workspace = await res.json()
      setNewName('')
      setShowCreate(false)
      router.push(`/workspace/${ws.id}`)
    } else {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? `Server error ${res.status}`)
    }
  }

  async function deleteWorkspace(id: string) {
    await fetch(`/api/workspaces/${id}`, { method: 'DELETE' })
    setWorkspaces(prev => prev.filter(w => w.id !== id))
    setConfirmDeleteId(null)
  }

  async function togglePublic(ws: Workspace) {
    const res = await fetch(`/api/workspaces/${ws.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: !ws.isPublic }),
    })
    if (res.ok) {
      const updated: Workspace = await res.json()
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, isPublic: updated.isPublic } : w))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
            <p className="text-sm text-gray-500 mt-1">Open a workspace to edit pseudocode</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(v => !v)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >+ New workspace</button>
            <button
              onClick={() => router.push('/profile')}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              title="Profile"
            >
              {profile?.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
                : <div className="w-6 h-6 rounded-full bg-gray-200" />}
              <span className="text-sm text-gray-700 font-medium">{profile?.username ?? '…'}</span>
            </button>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium rounded-lg transition-colors">Sign out</button>
            </form>
          </div>
        </div>

        {/* User search */}
        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Search users by username…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onBlur={() => setTimeout(() => setSearchResults([]), 200)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          {(searchResults.length > 0 || searching) && (
            <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {searching && <p className="text-xs text-gray-400 px-4 py-3">Searching…</p>}
              {searchResults.map(u => (
                <button
                  key={u.username}
                  onMouseDown={() => router.push(`/users/${u.username}`)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-50 text-left"
                >
                  {u.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <div className="w-7 h-7 rounded-full bg-gray-200" />}
                  <span className="text-sm font-medium text-gray-800">{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {showCreate && (
          <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex gap-3">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Workspace name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createWorkspace()}
              autoFocus
            />
            <button onClick={createWorkspace} disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >{creating ? 'Creating…' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setNewName('') }}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg"
            >Cancel</button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-8">Loading…</p>
        ) : workspaces.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-gray-400 text-sm mb-3">No workspaces yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-blue-600 hover:underline text-sm font-medium">
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map(ws => (
              <div key={ws.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm hover:border-blue-300 hover:shadow transition-all group">
                {confirmDeleteId === ws.id ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">Delete <span className="font-medium">{ws.name}</span> and all its files?</p>
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <button onClick={() => deleteWorkspace(ws.id)} className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <button onClick={() => router.push(`/workspace/${ws.id}`)} className="flex-1 text-left min-w-0">
                      <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors truncate">{ws.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Created {new Date(ws.createdAt).toLocaleDateString()}</p>
                    </button>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      {/* Public/private toggle */}
                      <button
                        onClick={() => togglePublic(ws)}
                        title={ws.isPublic ? 'Public — click to make private' : 'Private — click to make public'}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${ws.isPublic ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >{ws.isPublic ? '🌐 Public' : '🔒 Private'}</button>
                      <button onClick={() => router.push(`/workspace/${ws.id}`)} className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Open</button>
                      <button onClick={() => setConfirmDeleteId(ws.id)} className="text-xs px-2.5 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete workspace">✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
