'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Script from 'next/script'

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
  const [running, setRunning] = useState(false)
  const [forking, setForking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPrompts, setShowPrompts] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [consoleWidth, setConsoleWidth] = useState(320)
  const [isCollaborator, setIsCollaborator] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  const terminalRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const protectedLenRef = useRef(0)
  const inputHandlerRef = useRef<((e: any) => void) | null>(null)
  const awaitingInputRef = useRef(false)
  const terminatedRef = useRef(false)
  const interpreterReady = useRef(false)
  const vfsMirror = useRef<Record<string, string>>({})

  const lineCount = code.split('\n').length

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

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
    setProfile(me)

    if (me) {
      if (wsData.user.username === me.username) {
        // Owner — redirect to their own editor
        router.replace(`/workspace/${workspaceId}`)
        return
      }
      const collab = wsData.collaborators?.some(c => c.user.username === me.username) ?? false
      setIsCollaborator(collab)
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

  function initInterpreter() {
    const w = window as any
    if (interpreterReady.current || !w.pseudoIDE || !terminalRef.current) return
    const ta = terminalRef.current
    const outputEl = {
      get textContent() { return ta.value },
      set textContent(v: string) { ta.value = v; protectedLenRef.current = v.length; ta.scrollTop = ta.scrollHeight },
      get scrollTop() { return ta.scrollTop },
      set scrollTop(v: number) { ta.scrollTop = v },
      get scrollHeight() { return ta.scrollHeight },
    }
    const inputEl: any = {
      value: '',
      focus() {
        if (terminatedRef.current) throw new Error('Terminated')
        awaitingInputRef.current = true; ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length
      },
      addEventListener(_event: string, handler: (e: any) => void) { inputHandlerRef.current = handler },
    }
    w._termInputEl = inputEl
    w.pseudoIDE.init(outputEl, inputEl)
    interpreterReady.current = true
  }

  function openFile(f: PseudoFile) {
    const content = vfsMirror.current[f.name] ?? ''
    setActiveFile({ ...f, content })
    setCode(content)
  }

  async function runCode() {
    initInterpreter()
    const w = window as any
    if (!w.pseudoIDE) { if (terminalRef.current) terminalRef.current.value = 'Error: interpreter not loaded yet, try again.'; return }
    terminatedRef.current = false
    w.vfs = { ...vfsMirror.current }
    setRunning(true)
    try {
      await w.pseudoIDE.run(code, null)
    } catch (err: any) {
      if (terminalRef.current) terminalRef.current.value += '\nError: ' + err.message
    } finally {
      awaitingInputRef.current = false; setRunning(false)
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

  function terminateProgram() {
    terminatedRef.current = true
    awaitingInputRef.current = false
    if (inputHandlerRef.current) {
      const w = window as any
      if (w._termInputEl) w._termInputEl.value = ''
      inputHandlerRef.current({ key: 'Enter' })
    }
    if (terminalRef.current) terminalRef.current.value += '\n[Terminated]'
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

  return (
    <>
      <Script src="/pseudorunner/async_interpreter.js" strategy="afterInteractive" onLoad={initInterpreter} />
      <div className="flex h-screen bg-white overflow-hidden">

        {/* Sidebar */}
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

            {/* Collaborator avatars */}
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

        {/* Editor + Console */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Toolbar */}
          <div className="h-10 border-b border-gray-200 flex items-center px-3 gap-2 bg-white flex-shrink-0">
            <span className="text-sm font-mono text-gray-600 flex-1 truncate">
              {activeFile ? activeFile.name : <span className="italic text-gray-400">no file selected</span>}
            </span>
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
              <input id="showPrompts" type="checkbox" checked={showPrompts} onChange={e => setShowPrompts(e.target.checked)} className="accent-blue-600" />
              Show prompts
            </label>
            {canEdit && (
              <button onClick={saveFile} disabled={saving}
                className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >{saving ? 'Saving…' : 'Save'}</button>
            )}
            {!canEdit && (
              <button onClick={forkWorkspace} disabled={forking}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded font-semibold border border-gray-300"
              >{forking ? 'Forking…' : '⑂ Fork'}</button>
            )}
            {running
              ? <button onClick={terminateProgram}
                  className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-semibold"
                >■ Stop</button>
              : <button onClick={runCode}
                  className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold"
                >▶ Run</button>
            }
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Code editor */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 min-h-0">
              <div className="flex flex-1 overflow-auto min-h-0 bg-gray-50">
                <div
                  ref={lineNumRef}
                  className="bg-gray-100 text-gray-400 text-right text-xs font-mono select-none flex-shrink-0 pt-2.5 pr-2 pl-1"
                  style={{ lineHeight: '21px', minWidth: '2.5rem', height: `${lineCount * 21 + 20}px`, minHeight: '100%' }}
                >
                  {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea
                  value={code}
                  onChange={canEdit ? e => { setCode(e.target.value); if (activeFile) vfsMirror.current[activeFile.name] = e.target.value } : undefined}
                  readOnly={!canEdit}
                  spellCheck={false}
                  className={`flex-1 resize-none font-mono text-sm p-2.5 focus:outline-none ${canEdit ? 'bg-white text-gray-800' : 'bg-gray-50 text-gray-800 cursor-default'}`}
                  style={{ lineHeight: '21px', overflow: 'hidden', minHeight: '100%', height: `${lineCount * 21 + 20}px` }}
                />
              </div>
            </div>

            {/* Drag handle */}
            <div
              className="w-1 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors"
              onMouseDown={e => {
                e.preventDefault()
                const startX = e.clientX
                const startW = consoleWidth
                const onMove = (ev: MouseEvent) => setConsoleWidth(Math.max(180, Math.min(800, startW - (ev.clientX - startX))))
                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            />

            {/* Console */}
            <div className="flex-shrink-0 flex flex-col bg-white" style={{ width: consoleWidth }}>
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs font-medium text-gray-600">Console</span>
                <button onClick={() => { if (terminalRef.current) { terminalRef.current.value = ''; protectedLenRef.current = 0 } }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              </div>
              <textarea
                ref={terminalRef}
                className="flex-1 resize-none font-mono text-sm bg-white text-gray-800 p-2.5 focus:outline-none"
                style={{ lineHeight: '21px' }}
                onKeyDown={e => {
                  const ta = terminalRef.current!
                  if (e.key === 'Enter') {
                    if (!awaitingInputRef.current || !inputHandlerRef.current) { e.preventDefault(); return }
                    e.preventDefault()
                    const typed = ta.value.slice(protectedLenRef.current)
                    ta.value = ta.value.slice(0, protectedLenRef.current)
                    const w = window as any
                    if (w._termInputEl) w._termInputEl.value = typed
                    awaitingInputRef.current = false
                    inputHandlerRef.current({ key: 'Enter' })
                    return
                  }
                  const nav = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']
                  if (!awaitingInputRef.current && !nav.includes(e.key)) { e.preventDefault(); return }
                  if ((e.key === 'Backspace' || e.key === 'Delete') && ta.selectionStart <= protectedLenRef.current) { e.preventDefault() }
                }}
                onClick={() => {
                  const ta = terminalRef.current!
                  if (ta.selectionStart < protectedLenRef.current) { ta.selectionStart = ta.selectionEnd = ta.value.length }
                }}
                onPaste={e => { if (!awaitingInputRef.current) e.preventDefault() }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
