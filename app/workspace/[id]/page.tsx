'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'

interface PseudoFile {
  id: string
  name: string
  updatedAt: string
}

interface LoadedFile extends PseudoFile {
  content: string
}

const EXAMPLES = [
  {
    label: 'Bubble Sort',
    filename: 'bubble_sort.psc',
    code: `DECLARE Values : ARRAY[1:100] OF REAL

PROCEDURE SwapValue(BYREF X : REAL, Y : REAL)
    Temp <- X
    X <- Y
    Y <- Temp
ENDPROCEDURE

INPUT N
FOR Index <- 1 TO N
    INPUT Values[Index]
NEXT Index
Last <- N
REPEAT
    Swap <- FALSE
        FOR Index <- 1 TO Last - 1
            IF Values[Index] > Values[Index + 1] THEN
                CALL SwapValue(Values[Index], Values[Index + 1])
                Swap <- TRUE
            ENDIF
        NEXT Index
        Last <- Last - 1
UNTIL NOT Swap OR Last = 1
FOR Index <- 1 TO N
    OUTPUT Values[Index]
NEXT Index`,
  },
  {
    label: 'Factorial',
    filename: 'factorial.psc',
    code: `FUNCTION F(X:INTEGER) RETURNS INTEGER
    IF X = 0 THEN
        RETURN 1
    ELSE
        RETURN X * F(X-1)
    ENDIF
ENDFUNCTION

INPUT N
OUTPUT F(N)`,
  },
  {
    label: 'Linear Search',
    filename: 'linear_search.psc',
    code: `DECLARE Values : ARRAY[1:100] OF INTEGER
INPUT N
FOR Index <- 1 TO N
    INPUT Values[Index]
NEXT Index
INPUT X
Flag <- FALSE
Index <- 0
REPEAT
    Index <- Index + 1
    IF Values[Index] = X THEN
        OUTPUT "Position: ", Index
        Flag <- TRUE
    ENDIF
UNTIL Index = N OR Flag
IF NOT Flag THEN
    OUTPUT "Not found"
ENDIF`,
  },
  {
    label: 'File Handling',
    filename: 'file_handling.psc',
    code: `PROCEDURE PrintFile(File:STRING)
    OPENFILE File FOR READ
    WHILE NOT EOF(File) DO
        READFILE File, Line
        OUTPUT Line
    ENDWHILE
    CLOSEFILE File
ENDPROCEDURE

OPENFILE "File.txt" FOR WRITE
WRITEFILE "File.txt", "hello world"
WRITEFILE "File.txt", "lets learn pseudocode"
CLOSEFILE "File.txt"

OPENFILE "File.txt" FOR APPEND
WRITEFILE "File.txt", "new line"
WRITEFILE "File.txt", "another line"
CLOSEFILE "File.txt"

CALL PrintFile("File.txt")`,
  },
]

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
  const [running, setRunning] = useState(false)
  const [lineCount, setLineCount] = useState(1)
  const [showPrompts, setShowPrompts] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  // Rename state: which file id is being renamed, and the draft value
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null)
  const inputBoxRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const consoleInputRef = useRef<HTMLInputElement>(null)
  const interpreterReady = useRef(false)
  const vfsMirror = useRef<Record<string, string>>({})

  const loadFileList = useCallback(async () => {
    const res = await fetch(`/api/files?workspaceId=${workspaceId}`)
    if (!res.ok) { router.push('/'); return }
    let list: PseudoFile[] = await res.json()

    if (!list.find(f => f.name === 'main.psc')) {
      const created = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: 'main.psc', content: '' }),
      })
      if (created.ok) {
        const newFile: LoadedFile = await created.json()
        list = [newFile, ...list]
      }
    }

    setFiles(list)
    const entries = await Promise.all(
      list.map(f => fetch(`/api/files/${f.id}`).then(r => r.json()) as Promise<LoadedFile>)
    )
    const vfs: Record<string, string> = {}
    for (const f of entries) vfs[f.name] = f.content
    vfsMirror.current = vfs
    ;(window as any).vfs = { ...vfs }

    setActiveFile(prev => {
      if (prev) return prev
      const main = entries.find(f => f.name === 'main.psc')
      if (main) { setCode(main.content) }
      return main ?? null
    })
  }, [workspaceId, router])

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ws => ws && setWorkspaceName(ws.name))
    loadFileList()
  }, [workspaceId, loadFileList])

  useEffect(() => { setLineCount(code.split('\n').length) }, [code])

  function initInterpreter() {
    const w = window as any
    if (interpreterReady.current || !w.pseudoIDE || !consoleRef.current || !consoleInputRef.current) return
    w.pseudoIDE.init(consoleRef.current, consoleInputRef.current, document.getElementById('showPrompts'))
    interpreterReady.current = true
  }

  async function openFile(f: PseudoFile) {
    const content = vfsMirror.current[f.name] ?? ''
    setActiveFile({ ...f, content })
    setCode(content)
  }

  // Save current file. If unsaved, prompt for a name.
  async function saveFile() {
    if (activeFile) {
      setSaving(true)
      await fetch(`/api/files/${activeFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      })
      vfsMirror.current[activeFile.name] = code
      setSaving(false)
    } else {
      // Unsaved buffer — ask for a name then create
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
      setNewFileName('')
      setShowNewFile(false)
      await loadFileList()
      setActiveFile(created)
      setCode('')
    }
  }

  async function deleteFile(f: PseudoFile) {
    await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    if (activeFile?.id === f.id) { setActiveFile(null); setCode('') }
    setConfirmDeleteFileId(null)
    await loadFileList()
  }

  // Load example: create/upsert the file in DB with its slug name
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
      await loadFileList()
      setActiveFile(created)
      setCode(exCode)
    }
  }

  // Rename: commit the new name
  async function commitRename(f: PseudoFile) {
    let name = renameValue.trim()
    setRenamingId(null)
    if (!name || name === f.name) return
    if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'

    // Create new file with same content, delete old one
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
    await loadFileList()
    if (activeFile?.id === f.id) {
      setActiveFile(created)
    }
  }

  async function runCode() {
    initInterpreter()
    const w = window as any
    if (!w.pseudoIDE) {
      if (consoleRef.current) consoleRef.current.textContent = 'Error: interpreter not loaded yet, try again.'
      return
    }
    if (consoleRef.current) consoleRef.current.textContent = ''

    // Autosave active file before running
    if (activeFile && activeFile.name.endsWith('.psc')) {
      await fetch(`/api/files/${activeFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      })
      vfsMirror.current[activeFile.name] = code
    }

    const before = { ...vfsMirror.current }
    w.vfs = { ...vfsMirror.current }

    setRunning(true)
    try {
      await w.pseudoIDE.run(code, null)
      const after: Record<string, string> = w.vfs
      const changed: string[] = []
      for (const [name, content] of Object.entries(after)) {
        if (before[name] !== content) {
          changed.push(name)
          await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, name, content }),
          })
          vfsMirror.current[name] = content
        }
      }
      if (changed.length > 0) {
        const res = await fetch(`/api/files?workspaceId=${workspaceId}`)
        if (res.ok) setFiles(await res.json())
      }
    } catch (err: any) {
      if (consoleRef.current) consoleRef.current.textContent += '\nError: ' + err.message
    } finally {
      setRunning(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd

    if (e.key === 'Tab') {
      e.preventDefault()
      const lines = code.split('\n')
      if (e.shiftKey) {
        const sl = code.substring(0, start).split('\n').length - 1
        const el = code.substring(0, end).split('\n').length - 1
        let moved = 0, firstMoved = 0
        for (let i = sl; i <= el; i++) {
          const m = lines[i].match(/^( {1,4})/)
          if (m) { lines[i] = lines[i].substring(m[0].length); moved++; if (i === sl) firstMoved = m[0].length }
        }
        setCode(lines.join('\n'))
        setTimeout(() => { ta.selectionStart = start - firstMoved; ta.selectionEnd = end - moved * 4 }, 0)
      } else if (start !== end) {
        const sl = code.substring(0, start).split('\n').length - 1
        const el = code.substring(0, end).split('\n').length - 1
        for (let i = sl; i <= el; i++) lines[i] = '    ' + lines[i]
        setCode(lines.join('\n'))
        setTimeout(() => { ta.selectionStart = start + 4; ta.selectionEnd = end + (el - sl + 1) * 4 }, 0)
      } else {
        setCode(code.substring(0, start) + '    ' + code.substring(end))
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 4 }, 0)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const textBefore = code.substring(0, start)
      const indent = textBefore.substring(textBefore.lastIndexOf('\n') + 1).match(/^\s*/)?.[0] ?? ''
      const newVal = code.substring(0, start) + '\n' + indent + code.substring(end)
      setCode(newVal)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 1 + indent.length }, 0)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile, code])

  return (
    <>
      <Script
        src="/pseudorunner/async_interpreter.js"
        strategy="afterInteractive"
        onLoad={initInterpreter}
      />
      <div className="flex h-screen bg-white overflow-hidden">

        {/* Sidebar */}
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
                className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="name.psc"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFile()}
                autoFocus
              />
              <button onClick={createFile} className="text-xs bg-blue-600 text-white px-2 rounded hover:bg-blue-700">OK</button>
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
                    <button
                      onClick={() => deleteFile(f)}
                      className="text-xs px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium flex-shrink-0"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDeleteFileId(null)}
                      className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded font-medium flex-shrink-0"
                    >No</button>
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
                      >{f.name}</span>
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
            <Link href="/" className="block text-xs text-center text-gray-500 hover:text-gray-700">← Workspaces</Link>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="w-full text-xs text-center text-gray-400 hover:text-gray-600">Sign out</button>
            </form>
          </div>
        </div>

        {/* Editor + Console */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="h-10 border-b border-gray-200 flex items-center px-3 gap-2 bg-white flex-shrink-0">
            <span className="text-sm font-mono text-gray-600 flex-1 truncate">
              {activeFile ? activeFile.name : <span className="italic text-gray-400">unsaved</span>}
            </span>
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
              <input
                id="showPrompts"
                type="checkbox"
                checked={showPrompts}
                onChange={e => setShowPrompts(e.target.checked)}
                className="accent-blue-600"
              />
              Show prompts
            </label>
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
            <button onClick={runCode} disabled={running}
              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-semibold"
            >{running ? '⏳ Running…' : '▶ Run'}</button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Code editor */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
              <div className="flex flex-1 overflow-hidden">
                <div
                  ref={lineNumRef}
                  className="w-10 bg-gray-100 text-gray-400 text-right text-xs font-mono pt-2.5 pr-2 overflow-hidden select-none flex-shrink-0"
                  style={{ lineHeight: '21px' }}
                >
                  {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea
                  ref={inputBoxRef}
                  id="inputBox"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={() => { if (lineNumRef.current && inputBoxRef.current) lineNumRef.current.scrollTop = inputBoxRef.current.scrollTop }}
                  spellCheck={false}
                  placeholder="Enter pseudocode here…"
                  className="flex-1 resize-none font-mono text-sm bg-gray-50 text-gray-800 p-2.5 focus:outline-none"
                  style={{ lineHeight: '21px' }}
                />
              </div>
            </div>

            {/* Console panel */}
            <div className="w-80 flex-shrink-0 flex flex-col bg-white">
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs font-medium text-gray-600">Console</span>
                <button
                  onClick={() => { if (consoleRef.current) consoleRef.current.textContent = '' }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >Clear</button>
              </div>
              <div
                ref={consoleRef}
                className="flex-1 overflow-y-auto font-mono text-sm p-2.5 whitespace-pre-wrap bg-white text-gray-800"
                style={{ lineHeight: '21px' }}
              />
              <div className="border-t border-gray-200 p-2">
                <input
                  ref={consoleInputRef}
                  type="text"
                  placeholder={running ? 'Type input and press Enter…' : 'Run program to use input'}
                  disabled={!running}
                  className="w-full text-sm font-mono border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  When the program requests INPUT, type here and press Enter
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
