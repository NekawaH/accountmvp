'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Script from 'next/script'

interface PseudoFile { id: string; name: string; updatedAt: string }
interface LoadedFile extends PseudoFile { content: string }
interface WorkspaceInfo { id: string; name: string; user: { username: string; avatarUrl: string } }

export default function PublicWorkspacePage() {
  const { username, id: workspaceId } = useParams<{ username: string; id: string }>()
  const router = useRouter()

  const [ws, setWs] = useState<WorkspaceInfo | null>(null)
  const [files, setFiles] = useState<PseudoFile[]>([])
  const [activeFile, setActiveFile] = useState<LoadedFile | null>(null)
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [showPrompts, setShowPrompts] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const consoleRef = useRef<HTMLDivElement>(null)
  const consoleInputRef = useRef<HTMLInputElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const interpreterReady = useRef(false)
  const vfsMirror = useRef<Record<string, string>>({})

  const lineCount = code.split('\n').length

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

  const load = useCallback(async () => {
    const wsRes = await fetch(`/api/workspaces/${workspaceId}`)
    if (!wsRes.ok) { setNotFound(true); return }
    const wsData: WorkspaceInfo = await wsRes.json()
    if (wsData.user.username !== username) { setNotFound(true); return }
    setWs(wsData)

    const filesRes = await fetch(`/api/files?workspaceId=${workspaceId}`)
    if (!filesRes.ok) { setNotFound(true); return }
    const list: PseudoFile[] = await filesRes.json()
    setFiles(list)

    const entries = await Promise.all(
      list.map(f => fetch(`/api/files/${f.id}`).then(r => r.json()) as Promise<LoadedFile>)
    )
    const vfs: Record<string, string> = {}
    for (const f of entries) vfs[f.name] = f.content
    vfsMirror.current = vfs
    ;(window as any).vfs = { ...vfs }

    const main = entries.find(f => f.name === 'main.psc') ?? entries[0]
    if (main) { setActiveFile(main); setCode(main.content) }
  }, [workspaceId, username])

  useEffect(() => { load() }, [load])

  function initInterpreter() {
    const w = window as any
    if (interpreterReady.current || !w.pseudoIDE || !consoleRef.current || !consoleInputRef.current) return
    w.pseudoIDE.init(consoleRef.current, consoleInputRef.current, document.getElementById('showPrompts'))
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
    if (!w.pseudoIDE) {
      if (consoleRef.current) consoleRef.current.textContent = 'Error: interpreter not loaded yet, try again.'
      return
    }
    if (consoleRef.current) consoleRef.current.textContent = ''
    w.vfs = { ...vfsMirror.current }
    setRunning(true)
    try {
      await w.pseudoIDE.run(code, null)
    } catch (err: any) {
      if (consoleRef.current) consoleRef.current.textContent += '\nError: ' + err.message
    } finally {
      setRunning(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-3">Workspace not found or is private.</p>
          <button onClick={() => router.push('/')} className="text-blue-600 hover:underline text-sm">← Back</button>
        </div>
      </div>
    )
  }

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
            <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">Public · Read-only</span>
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
            <button onClick={runCode} disabled={running}
              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-semibold"
            >{running ? '⏳ Running…' : '▶ Run'}</button>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Code editor — read-only */}
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
                  readOnly
                  spellCheck={false}
                  className="flex-1 resize-none font-mono text-sm bg-gray-50 text-gray-800 p-2.5 focus:outline-none cursor-default"
                  style={{ lineHeight: '21px', overflow: 'hidden', minHeight: '100%', height: `${lineCount * 21 + 20}px` }}
                />
              </div>
            </div>

            {/* Console */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-white">
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs font-medium text-gray-600">Console</span>
                <button onClick={() => { if (consoleRef.current) consoleRef.current.textContent = '' }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              </div>
              <div ref={consoleRef} className="flex-1 overflow-y-auto font-mono text-sm p-2.5 whitespace-pre-wrap bg-white text-gray-800" style={{ lineHeight: '21px' }} />
              <div className="border-t border-gray-200 p-2">
                <input
                  ref={consoleInputRef}
                  type="text"
                  placeholder={running ? 'Type input and press Enter…' : 'Run program to use input'}
                  disabled={!running}
                  className="w-full text-sm font-mono border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">When the program requests INPUT, type here and press Enter</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
