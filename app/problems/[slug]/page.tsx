'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { highlightPseudocode } from '@/app/components/PseudocodeHighlight'

interface Example { input: string; output: string }
interface Problem {
  id: string
  slug: string
  title: string
  statement: string
  difficulty: number
  examples: Example[]
  testCount: number
}
interface CaseResult {
  index: number
  passed: boolean
  timedOut: boolean
  error: string | null
}
interface SubmitResult {
  passed: boolean
  testsPassed: number
  testsTotal: number
  cases: CaseResult[]
}

export default function ProblemPage({ params }: { params: { slug: string } }) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    fetch(`/api/problems/${params.slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(setProblem)
  }, [params.slug])

  // Code-editor key handling: Tab inserts 4 spaces (or indents the selected
  // block; Shift+Tab dedents), Enter preserves the current line's leading
  // indent, Backspace at a whitespace-only line start removes up to 4 spaces.
  // Uses document.execCommand so React's onChange fires and state stays in
  // sync — direct .value assignment would silently desync controlled inputs.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value

    if (e.key === 'Tab') {
      e.preventDefault()
      if (start !== end) {
        // Block indent / dedent — operate on whole selected lines.
        const blockStart = val.lastIndexOf('\n', start - 1) + 1
        const blockEnd = end > start && val[end - 1] === '\n' ? end - 1 : end
        const block = val.substring(blockStart, blockEnd)
        const newBlock = e.shiftKey
          ? block.split('\n').map(l => l.replace(/^ {1,4}/, '')).join('\n')
          : block.split('\n').map(l => '    ' + l).join('\n')
        ta.setSelectionRange(blockStart, blockEnd)
        document.execCommand('insertText', false, newBlock)
        ta.setSelectionRange(blockStart, blockStart + newBlock.length)
      } else if (e.shiftKey) {
        // Dedent current line.
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const lineEndIdx = val.indexOf('\n', start)
        const line = val.substring(lineStart, lineEndIdx === -1 ? val.length : lineEndIdx)
        const m = line.match(/^ {1,4}/)
        if (m) {
          ta.setSelectionRange(lineStart, lineStart + m[0].length)
          document.execCommand('delete')
        }
      } else {
        document.execCommand('insertText', false, '    ')
      }
      return
    }

    if (e.key === 'Enter' && start === end) {
      e.preventDefault()
      const lineStart = val.lastIndexOf('\n', start - 1) + 1
      const currentLine = val.substring(lineStart, start)
      const indent = currentLine.match(/^\s*/)?.[0] ?? ''
      document.execCommand('insertText', false, '\n' + indent)
      return
    }

    if (e.key === 'Backspace' && start === end && start > 0) {
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
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: params.slug, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!problem) {
    return <main className="max-w-3xl mx-auto p-6 text-gray-500">Loading…</main>
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="mb-4 text-sm">
        <Link href="/problems" className="text-blue-600 hover:underline">← Problems</Link>
      </div>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-bold">{problem.title}</h1>
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-sm">
          {problem.difficulty} pt{problem.difficulty === 1 ? '' : 's'}
        </span>
      </div>

      <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3 mb-4">
        {problem.statement}
      </pre>

      {problem.examples.length > 0 && (
        <div className="mb-4 space-y-3">
          {problem.examples.map((ex, i) => (
            <div key={i}>
              <div className="text-xs font-medium text-gray-600 mb-1">
                Example {problem.examples.length > 1 ? i + 1 : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Input</div>
                  <pre className="font-mono text-sm bg-gray-50 border rounded p-2 whitespace-pre-wrap">{ex.input}</pre>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Output</div>
                  <pre className="font-mono text-sm bg-gray-50 border rounded p-2 whitespace-pre-wrap">{ex.output}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mb-4">
        {problem.testCount} test case{problem.testCount === 1 ? '' : 's'}
      </p>

      <label className="block text-sm font-medium mb-1">Your pseudocode</label>
      <div className="relative w-full h-64 border rounded overflow-hidden bg-white">
        <pre
          ref={overlayRef}
          aria-hidden="true"
          className="absolute inset-0 font-mono text-sm p-3 m-0 overflow-auto"
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            pointerEvents: 'none',
            lineHeight: '21px',
            color: '#1f2937',
            background: 'transparent',
          }}
        >
          {highlightPseudocode(code.endsWith('\n') ? code + ' ' : code)}
        </pre>
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={e => {
            if (overlayRef.current) {
              overlayRef.current.scrollTop = e.currentTarget.scrollTop
              overlayRef.current.scrollLeft = e.currentTarget.scrollLeft
            }
          }}
          spellCheck={false}
          className="absolute inset-0 w-full h-full resize-none font-mono text-sm p-3 focus:outline-none bg-transparent"
          style={{ lineHeight: '21px', color: 'transparent', caretColor: '#1f2937' }}
        />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={submit}
          disabled={submitting || !code.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {submitting ? 'Grading…' : 'Submit'}
        </button>
        <span className="text-xs text-gray-500">
          Tip: prototype in a workspace first, then paste here.
        </span>
      </div>

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

      {result && (
        <div className="mt-5">
          <div className={`p-3 rounded mb-3 ${result.passed ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
            {result.passed
              ? `All ${result.testsTotal} tests passed — problem solved!`
              : `${result.testsPassed} / ${result.testsTotal} tests passed`}
          </div>
          <ul className="space-y-2">
            {result.cases.map(c => (
              <li key={c.index} className="border rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Test #{c.index + 1}{' '}
                    <span className={c.passed ? 'text-green-600' : 'text-red-600'}>
                      {c.passed ? 'passed' : c.timedOut ? 'time limit' : 'failed'}
                    </span>
                  </span>
                </div>
                {!c.passed && c.error && (
                  <p className="text-xs text-red-600 mt-1">{c.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
