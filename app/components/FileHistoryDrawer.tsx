'use client'

import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'

interface VersionSummary {
  id: string
  message: string | null
  createdAt: string
  author: { username: string; avatarUrl: string | null } | null
}

interface VersionDetail extends VersionSummary {
  content: string
}

interface Props {
  fileId: string
  fileName: string
  currentContent: string
  canEdit: boolean
  onClose: () => void
  /** Called when a restore succeeds; receives the restored content so the
   *  parent can sync the editor + vfsMirror. */
  onRestored: (content: string) => void
  /** Trigger a manual named-commit save through the parent (which owns the
   *  PUT /api/files/[id] call and the dirty-state bookkeeping). */
  onSaveWithMessage: (message: string) => Promise<void>
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function FileHistoryDrawer({
  fileId,
  fileName,
  currentContent,
  canEdit,
  onClose,
  onRestored,
  onSaveWithMessage,
}: Props) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<VersionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [savingMsg, setSavingMsg] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadList() {
    setErr(null)
    const res = await fetch(`/api/files/${fileId}/versions`)
    if (!res.ok) { setErr('Failed to load history'); return }
    const list: VersionSummary[] = await res.json()
    setVersions(list)
    if (list.length && !selectedId) setSelectedId(list[0].id)
  }

  useEffect(() => { loadList() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fileId])

  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); return }
    let cancelled = false
    setLoadingDetail(true)
    fetch(`/api/files/${fileId}/versions/${selectedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setSelectedDetail(d) })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [fileId, selectedId])

  const diffParts = useMemo(() => {
    if (!selectedDetail) return null
    // Normalize trailing newline so diffLines doesn't treat the last line as
    // changed purely because one side lacks a terminating \n.
    const pad = (s: string) => (s.endsWith('\n') ? s : s + '\n')
    return diffLines(pad(selectedDetail.content), pad(currentContent))
  }, [selectedDetail, currentContent])

  async function doRestore() {
    if (!selectedId) return
    setRestoring(true)
    setErr(null)
    const res = await fetch(`/api/files/${fileId}/versions/${selectedId}/restore`, { method: 'POST' })
    setRestoring(false)
    setConfirmRestore(false)
    if (!res.ok) { setErr('Restore failed'); return }
    const { content } = await res.json()
    onRestored(content)
    await loadList()
  }

  async function doSaveWithMessage() {
    const msg = commitMsg.trim()
    if (!msg) return
    setSavingMsg(true)
    setErr(null)
    try {
      await onSaveWithMessage(msg)
      setCommitMsg('')
      await loadList()
    } catch {
      setErr('Save failed')
    } finally {
      setSavingMsg(false)
    }
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[28rem] bg-white border-l border-gray-200 shadow-xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">History</div>
          <div className="text-xs text-gray-500 truncate">{fileName}</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
      </div>

      {canEdit && (
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex gap-1">
          <input
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSaveWithMessage() }}
            placeholder="Save with message…"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={doSaveWithMessage}
            disabled={!commitMsg.trim() || savingMsg}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium"
          >{savingMsg ? '…' : 'Save'}</button>
        </div>
      )}

      {err && <div className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100">{err}</div>}

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="max-h-56 overflow-y-auto border-b border-gray-200">
          {!versions && <div className="p-3 text-xs text-gray-400">Loading…</div>}
          {versions && versions.length === 0 && <div className="p-3 text-xs text-gray-400">No versions yet.</div>}
          {versions?.map((v, i) => (
            <button
              key={v.id}
              onClick={() => { setSelectedId(v.id); setConfirmRestore(false) }}
              className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${selectedId === v.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center gap-2">
                {v.author?.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={v.author.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />}
                <span className="text-xs font-medium text-gray-700 truncate">{v.author?.username ?? 'unknown'}</span>
                <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{relativeTime(v.createdAt)}</span>
                {i === 0 && <span className="text-[9px] uppercase tracking-wide bg-green-100 text-green-700 px-1 rounded">current</span>}
              </div>
              {v.message && <div className="text-xs text-gray-600 mt-0.5 truncate">{v.message}</div>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingDetail && <div className="p-3 text-xs text-gray-400">Loading diff…</div>}
          {!loadingDetail && selectedDetail && diffParts && (
            <>
              <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-white border-b border-gray-100">
                <span className="text-[11px] text-gray-500">Diff: <span className="text-red-600">selected</span> → <span className="text-green-700">current editor</span></span>
                {canEdit && versions && selectedId !== versions[0]?.id && (
                  confirmRestore ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={doRestore}
                        disabled={restoring}
                        className="text-xs px-2 py-0.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded font-medium"
                      >{restoring ? '…' : 'Confirm restore'}</button>
                      <button onClick={() => setConfirmRestore(false)} className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded">Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRestore(true)}
                      className="text-xs px-2 py-0.5 border border-gray-300 hover:bg-gray-50 rounded"
                    >Restore this version</button>
                  )
                )}
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap p-2 leading-snug">
                {diffParts.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added ? 'bg-green-50 text-green-800 block' :
                      part.removed ? 'bg-red-50 text-red-800 block line-through decoration-red-300' :
                      'text-gray-600 block'
                    }
                  >{part.value || '\n'}</span>
                ))}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
