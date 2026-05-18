'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Problem {
  id: string
  slug: string
  title: string
  difficulty: number
  solved: boolean
  _count: { submissions: number }
}

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/problems')
      .then(r => r.ok ? r.json() : [])
      .then(setProblems)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Problems</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Dashboard</Link>
          <Link href="/leaderboard" className="text-blue-600 hover:underline">Leaderboard</Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : problems.length === 0 ? (
        <p className="text-gray-500">No problems yet.</p>
      ) : (
        <ul className="divide-y border rounded">
          {problems.map(p => (
            <li key={p.id}>
              <Link
                href={`/problems/${p.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className={p.solved ? 'text-green-600' : 'text-gray-400'} aria-hidden>
                    {p.solved ? '✓' : '○'}
                  </span>
                  <span className="font-medium">{p.title}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{p._count.submissions} submissions</span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {p.difficulty} pt{p.difficulty === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
