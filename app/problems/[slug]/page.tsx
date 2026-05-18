'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Problem {
  id: string
  slug: string
  title: string
  statement: string
  difficulty: number
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

  useEffect(() => {
    fetch(`/api/problems/${params.slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(setProblem)
  }, [params.slug])

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

      <p className="text-xs text-gray-500 mb-4">
        {problem.testCount} hidden test{problem.testCount === 1 ? '' : 's'} — inputs are not shown.
      </p>

      <label className="block text-sm font-medium mb-1">Your pseudocode</label>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
        className="w-full h-64 font-mono text-sm border rounded p-3"
        placeholder={'INPUT N\nOUTPUT N'}
      />

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
