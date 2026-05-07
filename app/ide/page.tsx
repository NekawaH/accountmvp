'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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

export default function IDEPage() {
  const [files, setFiles] = useState<PseudoFile[]>([])
  const [activeFile, setActiveFile] = useState<LoadedFile | null>(null)
  const [code, setCode] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lineCount, setLineCount] = useState(1)
  const inputBoxRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)

  const loadFileList = useCallback(async () => {
    const res = await fetch('/api/files')
    if (res.ok) setFiles(await res.json())
  }, [])

  useEffect(() => { loadFileList() }, [loadFileList])
  useEffect(() => { setLineCount(code.split('\n').length) }, [code])

  async function openFile(f: PseudoFile) {
    const res = await fetch(`/api/files/${f.id}`)
    if (res.ok) {
      const data: LoadedFile = await res.json()
      setActiveFile(data)
      setCode(data.content)
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
    setSaving(false)
  }

  async function createFile() {
    let name = newFileName.trim()
    if (!name) return
    if (!name.endsWith('.psc') && !name.endsWith('.txt')) name += '.psc'
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: '' }),
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
    if (!confirm(`Delete "${f.name}"?`)) return
    await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    if (activeFile?.id === f.id) { setActiveFile(null); setCode('') }
    await loadFileList()
  }

  function loadExample(exCode: string) {
    setCode(exCode)
    setActiveFile(null)
    setShowExamples(false)
  }

  function runCode() {
    const outputEl = document.getElementById('outputBox') as HTMLTextAreaElement
    if (outputEl) outputEl.value = ''

    try {
      // @ts-ignore
      const PI = window.PseudoInterpreter
      if (!PI) { alert('Interpreter not loaded yet, try again.'); return }
      const interpreter = new PI()
      const parsed = interpreter.parse(code)
      interpreter.execute(parsed)
    } catch (err: any) {
      if (outputEl) outputEl.value = 'Error: ' + err.message
      else alert('Error: ' + err.message)
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
      <Script src="/pseudorunner/interpreter.js" strategy="beforeInteractive" />
      <div className="flex h-screen bg-white overflow-hidden">

        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-700">Files</span>
            <button
              onClick={() => setShowNewFile(v => !v)}
              className="text-blue-600 hover:text-blue-800 text-xl font-bold leading-none"
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
                className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-sm group ${activeFile?.id === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
                onClick={() => openFile(f)}
              >
                <span className="truncate">{f.name}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteFile(f) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-1 text-xs"
                >✕</button>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-gray-200 space-y-1.5">
            <Link href="/" className="block text-xs text-center text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="w-full text-xs text-center text-gray-400 hover:text-gray-600">Sign out</button>
            </form>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="h-10 border-b border-gray-200 flex items-center px-3 gap-2 bg-white flex-shrink-0">
            <span className="text-sm font-mono text-gray-600 flex-1 truncate">
              {activeFile ? activeFile.name : <span className="italic text-gray-400">unsaved</span>}
            </span>
            <div className="relative">
              <button
                onClick={() => setShowExamples(v => !v)}
                className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
              >Examples</button>
              {showExamples && (
                <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded shadow-lg w-44">
                  {EXAMPLES.map(ex => (
                    <button key={ex.label} onClick={() => loadExample(ex.code)}
                      className="block w-full text-left text-sm px-3 py-2 hover:bg-gray-50"
                    >{ex.label}</button>
                  ))}
                </div>
              )}
            </div>
            {activeFile && (
              <button onClick={saveFile} disabled={saving}
                className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >{saving ? 'Saving…' : 'Save'}</button>
            )}
            <button onClick={runCode}
              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold"
            >▶ Run</button>
          </div>

          {/* Code area */}
          <div className="flex-1 flex overflow-hidden border-b border-gray-200">
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

          {/* Output area */}
          <div className="h-44 flex-shrink-0 flex flex-col">
            <div className="px-3 py-1 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
              <span className="text-xs text-gray-500 font-medium">Output</span>
              <button
                onClick={() => { const el = document.getElementById('outputBox') as HTMLTextAreaElement; if (el) el.value = '' }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >Clear</button>
            </div>
            <textarea
              id="outputBox"
              readOnly
              placeholder="Output will appear here…"
              className="flex-1 resize-none font-mono text-sm bg-white text-gray-800 p-2.5 focus:outline-none"
              style={{ lineHeight: '21px' }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
