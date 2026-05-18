'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Row {
  rank: number
  username: string
  avatarUrl: string
  points: number
  solvedCount: number
  lastSolveAt: string
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Dashboard</Link>
          <Link href="/problems" className="text-blue-600 hover:underline">Problems</Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No one has solved a problem yet.</p>
      ) : (
        <table className="w-full text-sm border rounded overflow-hidden">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 w-12">#</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2 text-right">Solved</th>
              <th className="px-3 py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(r => (
              <tr key={r.username}>
                <td className="px-3 py-2 font-mono">{r.rank}</td>
                <td className="px-3 py-2">
                  <Link href={`/users/${r.username}`} className="flex items-center gap-2 hover:underline">
                    {r.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span>{r.username}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{r.solvedCount}</td>
                <td className="px-3 py-2 text-right font-medium">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
