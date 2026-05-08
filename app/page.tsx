'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Workspace {
  id: string
  name: string
  createdAt: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadWorkspaces() {
    const res = await fetch('/api/workspaces')
    if (res.ok) setWorkspaces(await res.json())
    setLoading(false)
  }

  useEffect(() => { loadWorkspaces() }, [])

  async function createWorkspace() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
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
    }
  }

  async function deleteWorkspace(ws: Workspace) {
    if (!confirm(`Delete workspace "${ws.name}"? This will delete all its files.`)) return
    await fetch(`/api/workspaces/${ws.id}`, { method: 'DELETE' })
    setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
            <p className="text-sm text-gray-500 mt-1">Open a workspace to edit pseudocode</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(v => !v)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New workspace
            </button>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

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
            <button
              onClick={createWorkspace}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName('') }}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-8">Loading…</p>
        ) : workspaces.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-gray-400 text-sm mb-3">No workspaces yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between shadow-sm hover:border-blue-300 hover:shadow transition-all group"
              >
                <button
                  onClick={() => router.push(`/workspace/${ws.id}`)}
                  className="flex-1 text-left"
                >
                  <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">{ws.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Created {new Date(ws.createdAt).toLocaleDateString()}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/workspace/${ws.id}`)}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteWorkspace(ws)}
                    className="text-xs px-2.5 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete workspace"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
