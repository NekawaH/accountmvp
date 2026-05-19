'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { HighlightedPseudocode } from './PseudocodeHighlight'
import { useYjsTextarea, Peer } from './useYjsTextarea'

export const EXAMPLES = [
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

interface Props {
  code: string
  setCode: (code: string) => void
  activeFileName: string | null
  showPrompts: boolean
  setShowPrompts: (v: boolean) => void
  onCodeChange?: (code: string) => void
  readOnly?: boolean
  toolbarExtras?: React.ReactNode
  sidebar: React.ReactNode
  /** Called before the interpreter runs; use to set window.vfs and autosave */
  onBeforeRun?: () => Promise<void>
  /** Called after the interpreter finishes; receives vfs snapshots for file-change sync */
  onAfterRun?: (vfsBefore: Record<string, string>, vfsAfter: Record<string, string>) => Promise<void>
  /** When set, the editor joins a Yjs room for this file and live-syncs
   *  with other connected collaborators. Pair with `currentUser`. */
  realtimeFileId?: string | null
  currentUser?: { username: string; avatarUrl: string | null } | null
  /** Optional callback receiving the live peer list (for sidebar UI). */
  onPeersChange?: (peers: Peer[]) => void
}

export function formatCode(src: string): string {
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

    const isClose = ['ENDIF','NEXT','ENDWHILE','ENDFUNCTION','ENDPROCEDURE','ENDTYPE','ENDCLASS','ENDCASE'].includes(tok0)
      || tok0 === 'ELSE' || up.startsWith('ELSE IF ')
      || (inCase && tok0 === 'UNTIL')

    const isUntil = tok0 === 'UNTIL'

    if (isClose || isUntil) indent = Math.max(0, indent - 1)

    let lineIndent = indent
    if (inCase && !isClose) {
      const colonIdx = line.indexOf(':')
      const isBranchLabel = colonIdx > 0 && colonIdx < line.length - 1
        ? false
        : colonIdx === line.length - 1 || (tok0 === 'OTHERWISE')
      if (isBranchLabel || tok0 === 'OTHERWISE') {
        lineIndent = caseIndent + 1
      }
    }

    result.push(IND.repeat(Math.max(0, lineIndent)) + line)

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

export default function WorkspaceShell({
  code,
  setCode,
  activeFileName,
  showPrompts,
  setShowPrompts,
  onCodeChange,
  readOnly = false,
  toolbarExtras,
  sidebar,
  onBeforeRun,
  onAfterRun,
  realtimeFileId = null,
  currentUser = null,
  onPeersChange,
}: Props) {
  const [running, setRunning] = useState(false)
  const [consoleWidth, setConsoleWidth] = useState(320)

  const inputBoxRef = useRef<HTMLTextAreaElement>(null)
  const terminalRef = useRef<HTMLTextAreaElement>(null)
  const protectedLenRef = useRef(0)
  const inputHandlerRef = useRef<((e: any) => void) | null>(null)
  const awaitingInputRef = useRef(false)
  const terminatedRef = useRef(false)
  const interpreterReady = useRef(false)
  const runningRef = useRef(false)

  const lineCount = code.split('\n').length

  // Realtime co-edit: when realtimeFileId is set, bind the textarea to a
  // Yjs room. The hook listens to `input` events in parallel with the
  // existing React onChange/onKeyDown handlers — local typing still
  // flows through setCode normally, and remote updates arrive via
  // applyRemoteString which preserves the local caret.
  const { peers } = useYjsTextarea({
    fileId: realtimeFileId,
    textareaRef: inputBoxRef,
    initialContent: code,
    onChange: next => { setCode(next); onCodeChange?.(next) },
    user: currentUser,
  })
  useEffect(() => { onPeersChange?.(peers) }, [peers, onPeersChange])

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

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
        awaitingInputRef.current = true
        ta.focus()
        ta.selectionStart = ta.selectionEnd = ta.value.length
      },
      addEventListener(_event: string, handler: (e: any) => void) { inputHandlerRef.current = handler },
    }
    ;(window as any)._termInputEl = inputEl
    w.pseudoIDE.init(outputEl, inputEl)
    interpreterReady.current = true
  }

  function terminateProgram() {
    terminatedRef.current = true
    awaitingInputRef.current = false
    const w = window as any
    // Tell the interpreter to bail out on its next yield point. Without this
    // a tight loop (e.g. WHILE TRUE ENDWHILE) would only stop when the step
    // cap is hit.
    if (w.pseudoIDE && typeof w.pseudoIDE.requestTerminate === 'function') {
      w.pseudoIDE.requestTerminate()
    }
    if (inputHandlerRef.current) {
      if (w._termInputEl) w._termInputEl.value = ''
      inputHandlerRef.current({ key: 'Enter' })
    }
    if (terminalRef.current) terminalRef.current.value += '\n[Terminated]'
  }

  async function runCode() {
    // Synchronous re-entry guard. Without this, spam-clicking Run while
    // onBeforeRun (autosave) is still in flight launches multiple concurrent
    // interpreter instances that share interpreter state and starve the
    // event loop, leaving the button visually stuck on "Run".
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)

    initInterpreter()
    const w = window as any
    if (!w.pseudoIDE) {
      if (terminalRef.current) terminalRef.current.value = 'Error: interpreter not loaded yet, try again.'
      runningRef.current = false
      setRunning(false)
      return
    }
    terminatedRef.current = false

    // Workspaces get a much larger step cap than the problem-solving grader
    // (~10M vs 500k). Step counting pauses while awaiting INPUT, so this
    // bounds actual computation, not wall-clock time spent waiting on the
    // user — long interactive sessions are still fine.
    if (typeof w.pseudoIDE.setStepLimit === 'function') {
      w.pseudoIDE.setStepLimit(10_000_000)
    }
    // Cooperatively yield to the event loop every N steps so the UI stays
    // responsive (Run→Stop swap, terminal scroll, etc.) and the Stop button
    // can actually interrupt tight loops. Kept low so empty-body tight
    // loops like `WHILE TRUE ENDWHILE` still yield frequently enough to
    // paint the Stop button and accept its click.
    if (typeof w.pseudoIDE.setYieldEvery === 'function') {
      w.pseudoIDE.setYieldEvery(1_000)
    }

    // Paint the Stop button before doing any blocking work (autosave or
    // the interpreter itself).
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    try {
      if (onBeforeRun) await onBeforeRun()
      else w.vfs = { ...(w.vfs ?? {}) }

      const vfsBefore: Record<string, string> = { ...w.vfs }
      await w.pseudoIDE.run(code, null)
      if (onAfterRun) await onAfterRun(vfsBefore, { ...w.vfs })
    } catch (err: any) {
      if (!terminatedRef.current) {
        if (terminalRef.current) terminalRef.current.value += '\nError: ' + err.message
      }
    } finally {
      awaitingInputRef.current = false
      runningRef.current = false
      setRunning(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return
    const ta = e.currentTarget

    if (e.key === 'Backspace') {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      if (start === end && start > 0) {
        const val = ta.value
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const beforeCursor = val.substring(lineStart, start)
        if (beforeCursor.length > 0 && /^ +$/.test(beforeCursor)) {
          e.preventDefault()
          const col = beforeCursor.length
          const target = col % 4 === 0 ? col - 4 : col - (col % 4)
          const deleteCount = col - Math.max(0, target)
          ta.setSelectionRange(start - deleteCount, start)
          document.execCommand('delete')
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value

      if (e.shiftKey) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const blockEnd = end > start && val[end - 1] === '\n' ? end - 1 : end
        const block = val.substring(lineStart, blockEnd)
        const lines = block.split('\n')
        let firstRemoved = 0
        let totalRemoved = 0
        const newLines = lines.map((l, i) => {
          const m = l.match(/^( {1,4})/)
          const removed = m ? m[1].length : 0
          if (i === 0) firstRemoved = removed
          totalRemoved += removed
          return removed ? l.slice(removed) : l
        })
        ta.setSelectionRange(lineStart, lineStart + block.length)
        document.execCommand('insertText', false, newLines.join('\n'))
        ta.setSelectionRange(Math.max(lineStart, start - firstRemoved), end - totalRemoved)
      } else if (start === end) {
        document.execCommand('insertText', false, '    ')
      } else {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const blockEnd = val[end - 1] === '\n' ? end - 1 : end
        const block = val.substring(lineStart, blockEnd)
        const lines = block.split('\n')
        ta.setSelectionRange(lineStart, lineStart + block.length)
        document.execCommand('insertText', false, lines.map(l => '    ' + l).join('\n'))
        ta.setSelectionRange(start + 4, end + lines.length * 4)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value

      const textBefore = val.substring(0, start)
      const currentLine = textBefore.substring(textBefore.lastIndexOf('\n') + 1)
      const currentIndent = currentLine.match(/^(\s*)/)?.[1] ?? ''
      const trimmed = currentLine.trim().toUpperCase()
      const tok0 = trimmed.split(/\s+/)[0]
      const lineAfter = val.substring(end).match(/^([^\n]*)/)?.[1]?.trim().toUpperCase() ?? ''
      const tok0After = lineAfter.split(/\s+/)[0]

      const closers = ['ENDIF','NEXT','ENDWHILE','ENDFUNCTION','ENDPROCEDURE','ENDTYPE','ENDCLASS','ENDCASE','UNTIL','ELSE']
      const nextIsClose = closers.includes(tok0After) || lineAfter.startsWith('ELSE IF ')
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

      const newIndent = (opensBlock && !nextIsClose) ? currentIndent + '    ' : currentIndent
      document.execCommand('insertText', false, '\n' + newIndent)
    }
  }

  return (
    <>
      <Script
        src="/pseudorunner/async_interpreter.js"
        strategy="afterInteractive"
        onLoad={initInterpreter}
      />
      <div className="flex h-screen bg-white overflow-hidden">
        {sidebar}

        {/* Editor + Console */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Toolbar */}
          <div className="h-10 border-b border-gray-200 flex items-center px-3 gap-2 bg-white flex-shrink-0">
            <span className="text-sm font-mono text-gray-600 flex-1 truncate">
              {activeFileName ?? <span className="italic text-gray-400">no file selected</span>}
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
            {toolbarExtras}
            {running
              ? <button onClick={terminateProgram}
                  className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-semibold"
                >■ Stop</button>
              : (() => {
                  const runnable = !activeFileName || activeFileName.endsWith('.psc')
                  return (
                    <button
                      onClick={runCode}
                      disabled={!runnable}
                      title={runnable ? undefined : 'Only .psc files can be executed'}
                      className={`text-xs px-3 py-1 rounded font-semibold text-white ${runnable ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >▶ Run</button>
                  )
                })()
            }
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Code editor */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex flex-1 overflow-auto min-h-0 bg-gray-50">
                <div
                  className="bg-gray-100 text-gray-400 text-right text-xs font-mono select-none flex-shrink-0 pt-2.5 pr-2 pl-1"
                  style={{ lineHeight: '21px', minWidth: '2.5rem', height: `${lineCount * 21 + 20}px`, minHeight: '100%' }}
                >
                  {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <div className="flex-1 relative" style={{ minHeight: '100%', height: `${lineCount * 21 + 20}px` }}>
                  <HighlightedPseudocode
                    code={code}
                    className="font-mono text-sm p-2.5"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      lineHeight: '21px',
                      color: '#1f2937',
                      background: 'transparent',
                    }}
                  />
                  <textarea
                    ref={inputBoxRef}
                    id="inputBox"
                    value={code}
                    onChange={e => { setCode(e.target.value); onCodeChange?.(e.target.value) }}
                    onKeyDown={handleKeyDown}
                    readOnly={readOnly}
                    spellCheck={false}
                    placeholder={readOnly ? undefined : 'Enter pseudocode here…'}
                    className={`absolute inset-0 w-full h-full resize-none font-mono text-sm p-2.5 focus:outline-none bg-transparent ${readOnly ? 'cursor-default' : ''}`}
                    style={{ lineHeight: '21px', overflow: 'hidden', color: 'transparent', caretColor: '#1f2937' }}
                  />
                </div>
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
                  // Always allow copy / select-all / other modifier shortcuts
                  // so the user can copy console output.
                  if (e.ctrlKey || e.metaKey) return
                  // Always allow caret navigation through existing output.
                  const nav = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Shift','Tab']
                  if (nav.includes(e.key)) return
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
                  if (!awaitingInputRef.current) { e.preventDefault(); return }
                  if ((e.key === 'Backspace' || e.key === 'Delete') && ta.selectionStart <= protectedLenRef.current) { e.preventDefault() }
                }}
                onClick={() => {
                  // Only snap caret to the end when actively awaiting INPUT —
                  // otherwise let the user freely click/select within the
                  // existing output so they can copy it.
                  if (!awaitingInputRef.current) return
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
