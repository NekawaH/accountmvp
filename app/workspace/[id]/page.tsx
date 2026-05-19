'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WorkspaceShell, { formatCode, EXAMPLES } from '../../components/WorkspaceShell'

interface PseudoFile {
  id: string
  name: string
  updatedAt: string
}

interface LoadedFile extends PseudoFile {
  content: string
}

interface Collaborator {
  userId: string
  user: { username: string; avatarUrl: string }
}

export default function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const router = useRouter()

  const [files, setFiles] = useState<PseudoFile[]>([])
  const [activeFile, setActiveFile] = useState<LoadedFile | null>(null)
  const [code, setCode] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPrompts, setShowPrompts] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null)
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null)
  const drafts = useRef<Record<string, string>>({})
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [showLeaveWarning, setShowLeaveWarning] = useState(false)
  const pendingLeave = useRef<(() => void) | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteStatus, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [inviting, setInviting] = useState(false)
  const [searchResults, setSearchResults] = useState<{ username: string; avatarUrl: string | null }[]>([])
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vfsMirror = useRef<Record<string, string>>({})
  const creatingFileRef = useRef(false)

  const loadFileList = useCallback(async () => {
    const res = await fetch(`/api/files?workspaceId=${workspaceId}&withContent=true`)
    if (!res.ok) { router.push('/'); return }
    let entries: LoadedFile[] = await res.json()

    if (!entries.find(f => f.name === 'main.psc')) {
      const created = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: 'main.psc', content: '' }),
      })
      if (created.ok) {
        const newFile: LoadedFile = await created.json()
        entries = [newFile, ...entries]
      }
    }

    setFiles(entries)
    const vfs: Record<string, string> = {}
    for (const f of entries) vfs[f.name] = f.content
    vfsMirror.current = vfs
    ;(window as any).vfs = { ...vfs }

    setActiveFile(prev => {
      if (prev) return prev
      const main = entries.find(f => f.name === 'main.psc')
      if (main) { setCode(drafts.current[main.id] ?? main.content) }
      return main ?? null
    })
    setFilesLoading(false)
  }, [workspaceId, router])

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ws => { if (ws) { setWorkspaceName(ws.name); setCollaborators(ws.collaborators ?? []) } })
    loadFileList()
  }, [workspaceId, loadFileList])

  function openFile(f: PseudoFile) {
    if (activeFile) {
      drafts.current[activeFile.id] = code
      const saved = vfsMirror.current[activeFile.name] ?? activeFile.content
      setDirtyIds(prev => {
        const next = new Set(prev)
        if (code !== saved) next.add(activeFile.id); else next.delete(activeFile.id)
        return next
      })
    }
    const content = drafts.current[f.id] ?? vfsMirror.current[f.name] ?? ''
    setActiveFile({ ...f, content })
    setCode(content)
  }

  async function saveFile() {
    if (activeFile) {
      setSaving(true)
      await fetch(`/api/files/${activeFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      })
      vfsMirror.current[activeFile.name] = code
      delete drafts.current[activeFile.id]
      setDirtyIds(prev => { const next = new Set(prev); next.delete(activeFile.id); return next })
      setSaving(false)
    } else {
      let name = prompt('Save as (e.g. my_program.psc):')?.trim()
      if (!name) return
      if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'
      setSaving(true)
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, content: code }),
      })
      setSaving(false)
      if (res.ok) {
        const created: LoadedFile = await res.json()
        await loadFileList()
        setActiveFile(created)
      }
    }
  }

  async function saveAllDrafts() {
    setSaving(true)
    const saves = Object.entries(drafts.current).map(([fileId, content]) => {
      const file = files.find(f => f.id === fileId)
      if (file) vfsMirror.current[file.name] = content
      return fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    })
    if (activeFile) {
      vfsMirror.current[activeFile.name] = code
      saves.push(fetch(`/api/files/${activeFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      }))
    }
    await Promise.all(saves)
    drafts.current = {}
    setDirtyIds(new Set())
    setSaving(false)
  }

  async function createFile() {
    if (creatingFileRef.current) return
    let name = newFileName.trim()
    if (!name) return
    if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'
    // Reject duplicates client-side to avoid creating two files with the same name.
    if (files.some(f => f.name === name)) {
      setNewFileName('')
      setShowNewFile(false)
      const existing = files.find(f => f.name === name)
      if (existing) openFile(existing)
      return
    }
    creatingFileRef.current = true
    // Clear the input immediately so a rapid second click/Enter is a no-op.
    setNewFileName('')
    setShowNewFile(false)
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, content: '' }),
      })
      if (res.ok) {
        const created: LoadedFile = await res.json()
        vfsMirror.current[name] = ''
        setFiles(prev => {
          if (prev.some(f => f.id === created.id || f.name === created.name)) return prev
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        })
        setActiveFile(created)
        setCode('')
      }
    } finally {
      creatingFileRef.current = false
    }
  }

  function hasDirtyFiles() {
    if (activeFile && code !== (vfsMirror.current[activeFile.name] ?? activeFile.content)) return true
    return dirtyIds.size > 0
  }

  function safeNavigate(action: () => void) {
    if (hasDirtyFiles()) {
      pendingLeave.current = action
      setShowLeaveWarning(true)
    } else {
      action()
    }
  }

  async function deleteFile(f: PseudoFile) {
    await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    if (activeFile?.id === f.id) { setActiveFile(null); setCode('') }
    delete drafts.current[f.id]
    delete vfsMirror.current[f.name]
    setDirtyIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
    setConfirmDeleteFileId(null)
    setFiles(prev => prev.filter(x => x.id !== f.id))
  }

  async function loadExample(filename: string, exCode: string) {
    setShowExamples(false)
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name: filename, content: exCode }),
    })
    if (res.ok) {
      const created: LoadedFile = await res.json()
      vfsMirror.current[filename] = exCode
      setFiles(prev => {
        const without = prev.filter(f => f.name !== filename)
        return [...without, created].sort((a, b) => a.name.localeCompare(b.name))
      })
      setActiveFile(created)
      setCode(exCode)
    }
  }

  async function commitRename(f: PseudoFile) {
    let name = renameValue.trim()
    setRenamingId(null)
    if (!name || name === f.name) return
    if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'
    const content = vfsMirror.current[f.name] ?? ''
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name, content }),
    })
    if (!res.ok) return
    const created: LoadedFile = await res.json()
    await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    delete vfsMirror.current[f.name]
    vfsMirror.current[name] = content
    setFiles(prev => prev.filter(x => x.id !== f.id).concat(created).sort((a, b) => a.name.localeCompare(b.name)))
    if (activeFile?.id === f.id) setActiveFile(created)
  }

  async function sendInvite() {
    if (!inviteUsername.trim()) return
    setInviting(true)
    setInviteStatus(null)
    const res = await fetch(`/api/workspaces/${workspaceId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: inviteUsername.trim() }),
    })
    const json = await res.json()
    setInviteStatus({ ok: res.ok, msg: res.ok ? `Invitation sent to ${inviteUsername.trim()}` : (json.error ?? 'Error') })
    if (res.ok) {
      setInviteUsername('')
      setSearchResults([])
    }
    setInviting(false)
  }

  async function removeCollaborator(userId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/collaborators/${userId}`, { method: 'DELETE' })
    if (res.ok) setCollaborators(prev => prev.filter(c => c.userId !== userId))
  }

  async function onBeforeRun() {
    const w = window as any
    if (activeFile && activeFile.name.endsWith('.psc')) {
      vfsMirror.current[activeFile.name] = code
      // Fire autosave in the background so Run starts immediately. The
      // interpreter only reads w.vfs (set synchronously below), so the
      // network round-trip doesn't need to block execution.
      const fileId = activeFile.id
      fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      }).then(() => {
        delete drafts.current[fileId]
        setDirtyIds(prev => {
          if (!prev.has(fileId)) return prev
          const next = new Set(prev); next.delete(fileId); return next
        })
      }).catch(() => {})
    }
    w.vfs = { ...vfsMirror.current }
  }

  async function onAfterRun(vfsBefore: Record<string, string>, vfsAfter: Record<string, string>) {
    const changedEntries = Object.entries(vfsAfter).filter(([name, content]) => vfsBefore[name] !== content)
    if (changedEntries.length > 0) {
      await Promise.all(changedEntries.map(([name, content]) => {
        vfsMirror.current[name] = content
        return fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, name, content }),
        })
      }))
      const res = await fetch(`/api/files?workspaceId=${workspaceId}`)
      if (res.ok) setFiles(await res.json())
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile, code])

  useEffect(() => {
    if (!showInvite) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = inviteUsername.trim()
    if (q.length < 2) { setSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setSearchResults(await res.json())
    }, 250)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [inviteUsername, showInvite])

  const sidebar = (
    <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-700 truncate" title={workspaceName}>
          {workspaceName || 'Files'}
        </span>
        <button
          onClick={() => setShowNewFile(v => !v)}
          className="text-blue-600 hover:text-blue-800 text-xl font-bold leading-none flex-shrink-0"
          title="New file"
        >+</button>
      </div>

      {showNewFile && (
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
        {files.length === 0 && (
          <p className="text-xs text-gray-400 p-3">No files yet. Click + to create one.</p>
        )}
        {files.map(f => (
          <div
            key={f.id}
            className={`px-2 py-1.5 text-sm group ${activeFile?.id === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
          >
            {confirmDeleteFileId === f.id ? (
              <div className="flex items-center gap-1">
                <span className="truncate flex-1 text-xs text-gray-600">Delete <span className="font-medium">{f.name}</span>?</span>
                <button onClick={() => deleteFile(f)} className="text-xs px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium flex-shrink-0">Yes</button>
                <button onClick={() => setConfirmDeleteFileId(null)} className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded font-medium flex-shrink-0">No</button>
              </div>
            ) : (
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => renamingId !== f.id && openFile(f)}
              >
                {renamingId === f.id ? (
                  <input
                    className="flex-1 text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none min-w-0"
                    value={renameValue}
                    autoFocus
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(f)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => commitRename(f)}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="truncate flex-1"
                    onDoubleClick={e => {
                      e.stopPropagation()
                      setRenamingId(f.id)
                      setRenameValue(f.name)
                    }}
                    title="Double-click to rename"
                  >
                    {f.name}
                    {(dirtyIds.has(f.id) || (activeFile?.id === f.id && code !== (vfsMirror.current[f.name] ?? activeFile.content))) && (
                      <span className="ml-1 text-yellow-500" title="Unsaved changes">●</span>
                    )}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteFileId(f.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-1 text-xs flex-shrink-0"
                >✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 space-y-1.5">
        {showInvite ? (
          <div className="space-y-1.5">
            <div className="relative">
              <input
                value={inviteUsername}
                onChange={e => { setInviteUsername(e.target.value); setInviteStatus(null) }}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                placeholder="Search users…"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-10 max-h-36 overflow-y-auto">
                  {searchResults.map(user => (
                    <button
                      key={user.username}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setInviteUsername(user.username); setSearchResults([]) }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-gray-50 text-left"
                    >
                      {user.avatarUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={user.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />}
                      <span className="text-xs text-gray-800 truncate">{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {inviteStatus && <p className={`text-xs ${inviteStatus.ok ? 'text-green-600' : 'text-red-500'}`}>{inviteStatus.msg}</p>}
            <div className="flex gap-1">
              <button onClick={sendInvite} disabled={inviting} className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium">{inviting ? '…' : 'Send invite'}</button>
              <button onClick={() => { setShowInvite(false); setInviteStatus(null); setSearchResults([]) }} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 rounded">✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowInvite(true)} className="block w-full text-xs text-center text-blue-600 hover:text-blue-700 font-medium">+ Invite collaborator</button>
        )}
        {collaborators.length > 0 && (
          <div className="space-y-1 pt-1">
            {collaborators.map(c => (
              <div key={c.userId} className="flex items-center gap-1.5 group">
                {confirmRemoveUserId === c.userId ? (
                  <>
                    <span className="text-xs text-gray-600 truncate flex-1">Remove <span className="font-medium">{c.user.username}</span>?</span>
                    <button
                      onClick={() => { removeCollaborator(c.userId); setConfirmRemoveUserId(null) }}
                      className="text-xs px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium flex-shrink-0"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmRemoveUserId(null)}
                      className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded font-medium flex-shrink-0"
                    >No</button>
                  </>
                ) : (
                  <>
                    {c.user.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.user.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />}
                    <span className="text-xs text-gray-600 truncate flex-1">{c.user.username}</span>
                    <button
                      onClick={() => setConfirmRemoveUserId(c.userId)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
                      title="Remove collaborator"
                    >✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => safeNavigate(() => router.push('/'))}
          className="block w-full text-xs text-center text-gray-500 hover:text-gray-700"
        >← Workspaces</button>
        <form action="/api/auth/logout" method="POST" onSubmit={e => {
          if (hasDirtyFiles()) { e.preventDefault(); safeNavigate(() => (e.target as HTMLFormElement).submit()) }
        }}>
          <button type="submit" className="w-full text-xs text-center text-gray-400 hover:text-gray-600">Sign out</button>
        </form>
      </div>
    </div>
  )

  const toolbarExtras = (
    <>
      <div className="relative">
        <button
          onClick={() => setShowExamples(v => !v)}
          className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
        >Examples</button>
        {showExamples && (
          <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded shadow-lg w-44">
            {EXAMPLES.map(ex => (
              <button key={ex.label} onClick={() => loadExample(ex.filename, ex.code)}
                className="block w-full text-left text-sm px-3 py-2 hover:bg-gray-50"
              >{ex.label}</button>
            ))}
          </div>
        )}
      </div>
      <button onClick={saveFile} disabled={saving}
        className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
      >{saving ? 'Saving…' : 'Save'}</button>
      <button
        onClick={() => {
          const ta = document.getElementById('inputBox') as HTMLTextAreaElement | null
          if (!ta) return
          ta.focus()
          ta.setSelectionRange(0, ta.value.length)
          document.execCommand('insertText', false, formatCode(code))
        }}
        disabled={!!activeFile && !activeFile.name.endsWith('.psc')}
        className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        title={activeFile && !activeFile.name.endsWith('.psc') ? 'Only .psc files can be formatted' : 'Format code'}
      >Format</button>
    </>
  )

  return (
    <>
      {/* Leave warning banner */}
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
          <div className="bg-white border border-yellow-300 shadow-xl rounded-xl px-5 py-4 flex items-center gap-4 pointer-events-auto">
            <span className="text-sm text-gray-800">You have unsaved changes. Leave anyway?</span>
            <button
              onClick={async () => { await saveAllDrafts(); setShowLeaveWarning(false); pendingLeave.current?.() }}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >{saving ? 'Saving…' : 'Save all & leave'}</button>
            <button
              onClick={() => { setShowLeaveWarning(false); pendingLeave.current?.() }}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
            >Discard & leave</button>
            <button
              onClick={() => { setShowLeaveWarning(false); pendingLeave.current = null }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >Stay</button>
          </div>
        </div>
      )}

      {filesLoading && (
        <div className="fixed inset-0 z-40 bg-white flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading workspace…</p>
        </div>
      )}

      <WorkspaceShell
        code={code}
        setCode={setCode}
        activeFileName={activeFile?.name ?? null}
        showPrompts={showPrompts}
        setShowPrompts={setShowPrompts}
        toolbarExtras={toolbarExtras}
        onBeforeRun={onBeforeRun}
        onAfterRun={onAfterRun}
        sidebar={sidebar}
      />
    </>
  )
}
