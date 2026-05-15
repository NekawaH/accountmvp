'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WorkspaceShell from '../../../../components/WorkspaceShell'

interface PseudoFile { id: string; name: string; updatedAt: string }
interface LoadedFile extends PseudoFile { content: string }
interface Collaborator { userId: string; user: { username: string; avatarUrl: string } }
interface WorkspaceInfo {
  id: string; name: string
  userId: string
  user: { username: string; avatarUrl: string }
  collaborators?: Collaborator[]
  _count?: { forks: number }
}
interface Profile { username: string; avatarUrl: string }

export default function PublicWorkspacePage() {
  const { username, id: workspaceId } = useParams<{ username: string; id: string }>()
  const router = useRouter()

  const [ws, setWs] = useState<WorkspaceInfo | null>(null)
  const [files, setFiles] = useState<PseudoFile[]>([])
  const [activeFile, setActiveFile] = useState<LoadedFile | null>(null)
  const [code, setCode] = useState('')
  const [forking, setForking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPrompts, setShowPrompts] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isCollaborator, setIsCollaborator] = useState(false)
  const vfsMirror = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    const [wsRes, profileRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}`),
      fetch('/api/profile'),
    ])
    if (!wsRes.ok) { setNotFound(true); return }
    const wsData: WorkspaceInfo = await wsRes.json()
    if (wsData.user.username !== username) { setNotFound(true); return }
    setWs(wsData)

    const me: Profile | null = profileRes.ok ? await profileRes.json() : null

    if (me) {
      if (wsData.user.username === me.username) {
        router.replace(`/workspace/${workspaceId}`)
        return
      }
      setIsCollaborator(wsData.collaborators?.some(c => c.user.username === me.username) ?? false)
    }

    const filesRes = await fetch(`/api/files?workspaceId=${workspaceId}&withContent=true`)
    if (!filesRes.ok) { setNotFound(true); return }
    const entries: LoadedFile[] = await filesRes.json()
    setFiles(entries)

    const vfs: Record<string, string> = {}
    for (const f of entries) vfs[f.name] = f.content
    vfsMirror.current = vfs
    ;(window as any).vfs = { ...vfs }

    const main = entries.find(f => f.name === 'main.psc') ?? entries[0]
    if (main) { setActiveFile(main); setCode(main.content) }
  }, [workspaceId, username, router])

  useEffect(() => { load() }, [load])

  function openFile(f: PseudoFile) {
    const content = vfsMirror.current[f.name] ?? ''
    setActiveFile({ ...f, content })
    setCode(content)
  }

  async function saveFile() {
    if (!activeFile) return
    setSaving(true)
    await fetch(`/api/files/${activeFile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: code }),
    })
    vfsMirror.current[activeFile.name] = code
    setSaving(false)
  }

  async function forkWorkspace() {
    setForking(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/fork`, { method: 'POST' })
    if (res.ok) { const { id } = await res.json(); router.push(`/workspace/${id}`) }
    else setForking(false)
  }

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-3">Workspace not found or is private.</p>
        <button onClick={() => router.push('/')} className="text-blue-600 hover:underline text-sm">← Back</button>
      </div>
    </div>
  )

  const canEdit = isCollaborator

  const sidebar = (
    <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        {ws && (
          <button onClick={() => router.push(`/users/${username}`)} className="flex items-center gap-2 w-full text-left hover:opacity-80">
            {ws.user.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={ws.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
              : <div className="w-6 h-6 rounded-full bg-gray-200 flex-shrink-0" />}
            <span className="text-sm font-medium text-gray-700 truncate">{ws.user.username}</span>
          </button>
        )}
        <p className="text-xs text-gray-500 mt-1.5 truncate font-semibold">{ws?.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {isCollaborator
            ? <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Collaborating</span>
            : <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">Public · Read-only</span>
          }
          {ws?._count && ws._count.forks > 0 && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">⑂ {ws._count.forks}</span>}
        </div>
        {ws?.collaborators && ws.collaborators.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {ws.collaborators.map(c => (
              c.user.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img key={c.userId} src={c.user.avatarUrl} alt={c.user.username} title={c.user.username} className="w-5 h-5 rounded-full object-cover border border-white" />
                : <div key={c.userId} title={c.user.username} className="w-5 h-5 rounded-full bg-gray-300 border border-white" />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.map(f => (
          <div
            key={f.id}
            onClick={() => openFile(f)}
            className={`px-3 py-1.5 cursor-pointer text-sm truncate ${activeFile?.id === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
          >{f.name}</div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200">
        <button onClick={() => router.push(`/users/${username}`)} className="block w-full text-xs text-center text-gray-500 hover:text-gray-700">
          ← {username}'s profile
        </button>
      </div>
    </div>
  )

  const toolbarExtras = canEdit ? (
    <button onClick={saveFile} disabled={saving}
      className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
    >{saving ? 'Saving…' : 'Save'}</button>
  ) : (
    <button onClick={forkWorkspace} disabled={forking}
      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded font-semibold border border-gray-300"
    >{forking ? 'Forking…' : '⑂ Fork'}</button>
  )

  return (
    <WorkspaceShell
      code={code}
      setCode={setCode}
      activeFileName={activeFile?.name ?? null}
      showPrompts={showPrompts}
      setShowPrompts={setShowPrompts}
      onCodeChange={canEdit ? (v: string) => { if (activeFile) vfsMirror.current[activeFile.name] = v } : undefined}
      readOnly={!canEdit}
      toolbarExtras={toolbarExtras}
      sidebar={sidebar}
    />
  )
}
