'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  const [showPrompts, setShowPrompts] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [filesLoading, setFilesLoading] = useState(true)
  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null)
  // Draft state: in-memory unsaved edits per file id
  const drafts = useRef<Record<string, string>>({})
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  // Leave confirmation banner
  const [showLeaveWarning, setShowLeaveWarning] = useState(false)
  const pendingLeave = useRef<(() => void) | null>(null)
  const [consoleWidth, setConsoleWidth] = useState(320)
  const inputBoxRef = useRef<HTMLTextAreaElement>(null)
  const terminalRef = useRef<HTMLTextAreaElement>(null)
  const protectedLenRef = useRef(0)
  const inputHandlerRef = useRef<((e: any) => void) | null>(null)
  const awaitingInputRef = useRef(false)
  const terminatedRef = useRef(false)
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
      if (main) { setCode(drafts.current[main.id] ?? main.content) }
      return main ?? null
    })
    setFilesLoading(false)
  }, [workspaceId, router])

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ws => ws && setWorkspaceName(ws.name))
    loadFileList()
  }, [workspaceId, loadFileList])

  const lineCount = code.split('\n').length

  function initInterpreter() {
    const w = window as any
    if (interpreterReady.current || !w.pseudoIDE || !terminalRef.current) return

    const ta = terminalRef.current

    // Adapter: acts like a div with .textContent for the interpreter's output
    const outputEl = {
      get textContent() { return ta.value },
      set textContent(v: string) {
        ta.value = v
        protectedLenRef.current = v.length
        ta.scrollTop = ta.scrollHeight
      },
      get scrollTop() { return ta.scrollTop },
      set scrollTop(v: number) { ta.scrollTop = v },
      get scrollHeight() { return ta.scrollHeight },
    }

    // Adapter: acts like an input[type=text] for the interpreter's keydown listener
    const inputEl: any = {
      value: '',
      focus() {
        if (terminatedRef.current) throw new Error('Terminated')
        awaitingInputRef.current = true
        ta.focus()
        ta.selectionStart = ta.selectionEnd = ta.value.length
      },
      addEventListener(_event: string, handler: (e: any) => void) {
        inputHandlerRef.current = handler
      },
    }
    w._termInputEl = inputEl

    w.pseudoIDE.init(outputEl, inputEl)
    interpreterReady.current = true
  }

  async function openFile(f: PseudoFile) {
    // Stash current edits as a draft
    if (activeFile) {
      drafts.current[activeFile.id] = code
      const saved = vfsMirror.current[activeFile.name] ?? activeFile.content
      setDirtyIds(prev => {
        const next = new Set(prev)
        if (code !== saved) next.add(activeFile.id); else next.delete(activeFile.id)
        return next
      })
    }
    // Restore draft or saved content
    const content = drafts.current[f.id] ?? vfsMirror.current[f.name] ?? ''
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
      delete drafts.current[activeFile.id]
      setDirtyIds(prev => { const next = new Set(prev); next.delete(activeFile.id); return next })
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

  async function saveAllDrafts() {
    setSaving(true)
    for (const [fileId, content] of Object.entries(drafts.current)) {
      await fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const file = files.find(f => f.id === fileId)
      if (file) vfsMirror.current[file.name] = content
    }
    // Also save current active file
    if (activeFile) {
      await fetch(`/api/files/${activeFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      })
      vfsMirror.current[activeFile.name] = code
    }
    drafts.current = {}
    setDirtyIds(new Set())
    setSaving(false)
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

  function hasDirtyFiles() {
    // active file dirty?
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
    setDirtyIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
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

  function terminateProgram() {
    terminatedRef.current = true
    awaitingInputRef.current = false
    // Unblock any pending input promise by firing the handler with a sentinel
    if (inputHandlerRef.current) {
      const w = window as any
      if (w._termInputEl) w._termInputEl.value = ''
      inputHandlerRef.current({ key: 'Enter' })
    }
    if (terminalRef.current) terminalRef.current.value += '\n[Terminated]'
  }

  async function runCode() {
    initInterpreter()
    const w = window as any
    if (!w.pseudoIDE) {
      if (terminalRef.current) terminalRef.current.value = 'Error: interpreter not loaded yet, try again.'
      return
    }
    if (terminalRef.current) { terminalRef.current.value = ''; protectedLenRef.current = 0 }
    terminatedRef.current = false

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
      if (!terminatedRef.current) {
        if (terminalRef.current) terminalRef.current.value += '\nError: ' + err.message
      }
    } finally {
      setRunning(false)
    }
  }

  function formatCode(src: string): string {
    const lines = src.split('\n')
    let indent = 0
    const IND = '    '
    const result: string[] = []
    let inCase = false
    let caseIndent = 0

    for (const raw of lines) {
      const line = raw.trim()
      if (line === '') { result.push(''); continue }

      const up = line.toUpperCase()
      const tok0 = up.split(/\s+/)[0]

      // Keywords that close a block (dedent before printing)
      const isClose = ['ENDIF','NEXT','ENDWHILE','ENDFUNCTION','ENDPROCEDURE','ENDTYPE','ENDCLASS','ENDCASE'].includes(tok0)
        || tok0 === 'ELSE' || up.startsWith('ELSE IF ')
        || (inCase && tok0 === 'UNTIL') // REPEAT/UNTIL handled below

      // UNTIL closes REPEAT
      const isUntil = tok0 === 'UNTIL'

      if (isClose || isUntil) indent = Math.max(0, indent - 1)

      // CASE branch labels: "value :" or "OTHERWISE :"
      // Inside a CASE block they sit at caseIndent+1, their bodies at caseIndent+2
      // We handle this by detecting ":" at end of a non-keyword line inside CASE
      let lineIndent = indent
      if (inCase && !isClose) {
        const colonIdx = line.indexOf(':')
        const isBranchLabel = colonIdx > 0 && colonIdx < line.length - 1
          ? false // inline branch+body, treat as normal
          : colonIdx === line.length - 1 || (tok0 === 'OTHERWISE')
        if (isBranchLabel || tok0 === 'OTHERWISE') {
          lineIndent = caseIndent + 1
        }
      }

      result.push(IND.repeat(Math.max(0, lineIndent)) + line)

      // Keywords that open a block (indent after printing)
      const opensBlock =
        (tok0 === 'IF' && up.includes(' THEN')) ||
        tok0 === 'ELSE' || up.startsWith('ELSE IF ') ||
        tok0 === 'FOR' ||
        (tok0 === 'WHILE' && up.includes(' DO')) ||
        tok0 === 'REPEAT' ||
        tok0 === 'FUNCTION' ||
        tok0 === 'PROCEDURE' ||
        tok0 === 'TYPE' ||
        tok0 === 'CLASS' ||
        (tok0 === 'CASE' && up.startsWith('CASE OF'))

      if (tok0 === 'CASE' && up.startsWith('CASE OF')) {
        inCase = true
        caseIndent = indent
      }
      if (tok0 === 'ENDCASE') inCase = false

      if (opensBlock) indent++
    }

    return result.join('\n')
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
      const currentLine = textBefore.substring(textBefore.lastIndexOf('\n') + 1)
      const currentIndent = currentLine.match(/^(\s*)/)?.[1] ?? ''
      const trimmed = currentLine.trim().toUpperCase()
      const tok0 = trimmed.split(/\s+/)[0]
      const lineAfter = code.substring(end).match(/^([^\n]*)/)?.[1]?.trim().toUpperCase() ?? ''
      const tok0After = lineAfter.split(/\s+/)[0]

      // Closing keyword on next line: keep current indent (don't add extra)
      const nextIsClose = ['ENDIF','NEXT','ENDWHILE','ENDFUNCTION','ENDPROCEDURE','ENDTYPE','ENDCLASS','ENDCASE','UNTIL','ELSE'].includes(tok0After)
        || lineAfter.startsWith('ELSE IF ')

      // Current line opens a block
      const opensBlock =
        (tok0 === 'IF' && trimmed.includes(' THEN')) ||
        tok0 === 'ELSE' || trimmed.startsWith('ELSE IF ') ||
        tok0 === 'FOR' ||
        (tok0 === 'WHILE' && trimmed.includes(' DO')) ||
        tok0 === 'REPEAT' ||
        tok0 === 'FUNCTION' ||
        tok0 === 'PROCEDURE' ||
        tok0 === 'TYPE' ||
        tok0 === 'CLASS' ||
        (tok0 === 'CASE' && trimmed.startsWith('CASE OF'))

      const IND = '    '
      const newIndent = opensBlock && !nextIsClose
        ? currentIndent + IND
        : currentIndent

      const newVal = code.substring(0, start) + '\n' + newIndent + code.substring(end)
      setCode(newVal)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 1 + newIndent.length }, 0)
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

      {/* Leave warning banner */}
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
          <div className="bg-white border border-yellow-300 shadow-xl rounded-xl px-5 py-4 flex items-center gap-4 pointer-events-auto">
            <span className="text-sm text-gray-800">You have unsaved changes. Leave anyway?</span>
            <button
              onClick={async () => {
                await saveAllDrafts()
                setShowLeaveWarning(false)
                pendingLeave.current?.()
              }}
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

      {/* Loading screen — shown until files are ready */}
      {filesLoading && (
        <div className="fixed inset-0 z-40 bg-white flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading workspace…</p>
        </div>
      )}
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

        {/* Editor + Console */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
            <button onClick={() => setCode(formatCode(code))}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
              title="Format code"
            >Format</button>
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
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Single scrolling container — line numbers and textarea scroll together */}
              <div className="flex flex-1 overflow-auto min-h-0 bg-gray-50">
                <div
                  className="bg-gray-100 text-gray-400 text-right text-xs font-mono select-none flex-shrink-0 pt-2.5 pr-2 pl-1"
                  style={{ lineHeight: '21px', minWidth: '2.5rem', height: `${lineCount * 21 + 20}px`, minHeight: '100%' }}
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={inputBoxRef}
                  id="inputBox"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  placeholder="Enter pseudocode here…"
                  className="flex-1 resize-none font-mono text-sm bg-gray-50 text-gray-800 p-2.5 focus:outline-none"
                  style={{
                    lineHeight: '21px',
                    overflow: 'hidden',
                    minHeight: '100%',
                    height: `${lineCount * 21 + 20}px`,
                  }}
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

            {/* Terminal panel */}
            <div className="flex-shrink-0 flex flex-col bg-white" style={{ width: consoleWidth }}>
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs font-medium text-gray-600">Console</span>
                <button
                  onClick={() => { if (terminalRef.current) { terminalRef.current.value = ''; protectedLenRef.current = 0 } }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >Clear</button>
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
                    // Strip what the user typed so the interpreter's echo is the only copy
                    ta.value = ta.value.slice(0, protectedLenRef.current)
                    const w = window as any
                    if (w._termInputEl) w._termInputEl.value = typed
                    awaitingInputRef.current = false
                    inputHandlerRef.current({ key: 'Enter' })
                    return
                  }
                  // Block all editing when not awaiting input, except navigation keys
                  const nav = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']
                  if (!awaitingInputRef.current && !nav.includes(e.key)) {
                    e.preventDefault(); return
                  }
                  // When awaiting input, prevent editing into protected output
                  if ((e.key === 'Backspace' || e.key === 'Delete') && ta.selectionStart <= protectedLenRef.current) {
                    e.preventDefault()
                  }
                }}
                onClick={() => {
                  const ta = terminalRef.current!
                  if (ta.selectionStart < protectedLenRef.current) {
                    ta.selectionStart = ta.selectionEnd = ta.value.length
                  }
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
