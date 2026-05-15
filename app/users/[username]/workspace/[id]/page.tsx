'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WorkspaceShell, { formatCode, EXAMPLES } from '../../../../components/WorkspaceShell'

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
  const [showExamples, setShowExamples] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const vfsMirror = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    const [wsRes, profileRes, filesRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}`),
      fetch('/api/profile'),
      fetch(`/api/files?workspaceId=${workspaceId}&withContent=true`),
    ])
    if (!wsRes.ok || !filesRes.ok) { setNotFound(true); return }
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

  async function createFile() {
    let name = newFileName.trim()
    if (!name) return
    if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name, content: '' }),
    })
    if (res.ok) {
      const created: LoadedFile = await res.json()
      vfsMirror.current[name] = ''
      setFiles(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewFileName('')
      setShowNewFile(false)
      setActiveFile(created)
      setCode('')
    }
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
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-gray-500 truncate font-semibold">{ws?.name}</p>
          {canEdit && (
            <button
              onClick={() => setShowNewFile(v => !v)}
              className="text-blue-600 hover:text-blue-800 text-xl font-bold leading-none flex-shrink-0 ml-1"
              title="New file"
            >+</button>
          )}
        </div>
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
              <button key={c.userId} onClick={() => router.push(`/users/${c.user.username}`)} title={c.user.username} className="hover:opacity-80">
                {c.user.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.user.avatarUrl} alt={c.user.username} className="w-5 h-5 rounded-full object-cover border border-white" />
                  : <div className="w-5 h-5 rounded-full bg-gray-300 border border-white" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {canEdit && showNewFile && (
        <div className="p-2 border-b border-gray-200 flex gap-1">
          <input
            className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            placeholder="name.psc"
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') createFile()
              if (e.key === 'Escape') { setShowNewFile(false); setNewFileName('') }
            }}
            autoFocus
          />
          <button onClick={createFile} className="text-xs bg-blue-600 text-white px-2 rounded hover:bg-blue-700 flex-shrink-0">OK</button>
          <button onClick={() => { setShowNewFile(false); setNewFileName('') }} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 rounded flex-shrink-0">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {files.map(f => (
          <div
            key={f.id}
            onClick={() => openFile(f)}
            className={`px-3 py-1.5 cursor-pointer text-sm truncate ${activeFile?.id === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
          >
            {f.name}
            {activeFile?.id === f.id && code !== (vfsMirror.current[f.name] ?? '') && (
              <span className="ml-1 text-yellow-500" title="Unsaved changes">●</span>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200">
        <button onClick={() => router.push('/')} className="block w-full text-xs text-center text-gray-500 hover:text-gray-700">
          ← Dashboard
        </button>
      </div>
    </div>
  )

  const toolbarExtras = (
    <>
      {canEdit && (
        <>
          <div className="relative">
            <button
              onClick={() => setShowExamples(v => !v)}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >Examples</button>
            {showExamples && (
              <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded shadow-lg w-44">
                {EXAMPLES.map(ex => (
                  <button key={ex.label} onClick={() => { setCode(ex.code); setShowExamples(false) }}
                    className="block w-full text-left text-sm px-3 py-2 hover:bg-gray-50"
                  >{ex.label}</button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const ta = document.getElementById('inputBox') as HTMLTextAreaElement | null
              if (!ta) return
              ta.focus()
              ta.setSelectionRange(0, ta.value.length)
              document.execCommand('insertText', false, formatCode(code))
            }}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
            title="Format code"
          >Format</button>
          <button onClick={saveFile} disabled={saving}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >{saving ? 'Saving…' : 'Save'}</button>
        </>
      )}
      {!canEdit && (
        <button onClick={forkWorkspace} disabled={forking}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded font-semibold border border-gray-300"
        >{forking ? 'Forking…' : '⑂ Fork'}</button>
      )}
    </>
  )

  return (
    <WorkspaceShell
      code={code}
      setCode={setCode}
      activeFileName={activeFile?.name ?? null}
      showPrompts={showPrompts}
      setShowPrompts={setShowPrompts}
      readOnly={!canEdit}
      toolbarExtras={toolbarExtras}
      sidebar={sidebar}
    />
  )
}
