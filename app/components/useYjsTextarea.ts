'use client'

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { applyRemoteString, computeOps } from '@/lib/realtime/yjsBridge'

export interface Peer {
  clientId: number
  username: string
  avatarUrl: string | null
  color: string
}

interface Params {
  fileId: string | null
  textareaRef: React.RefObject<HTMLTextAreaElement>
  /** Current React-state copy of the file content. Used to seed the doc on
   *  first connect if the server-side doc is empty. */
  initialContent: string
  /** Called whenever the doc value changes (local or remote). Keep React
   *  state, dirty flags, and `vfsMirror` in sync. */
  onChange: (next: string) => void
  /** Current user shown to other peers in awareness. */
  user: { username: string; avatarUrl: string | null } | null
}

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export function useYjsTextarea({ fileId, textareaRef, initialContent, onChange, user }: Params) {
  const [connected, setConnected] = useState(false)
  const [peers, setPeers] = useState<Peer[]>([])
  const providerRef = useRef<WebsocketProvider | null>(null)

  useEffect(() => {
    if (!fileId || !user) return
    let cancelled = false
    let provider: WebsocketProvider | null = null
    let doc: Y.Doc | null = null
    let detachInput: (() => void) | null = null

    ;(async () => {
      // Fetch a short-lived auth token for the WS server.
      const tokRes = await fetch('/api/realtime/token')
      if (!tokRes.ok) return
      const { token } = await tokRes.json()
      if (cancelled) return

      const wsUrl = process.env.NEXT_PUBLIC_YWS_URL || 'ws://localhost:1234'
      doc = new Y.Doc()
      const yText = doc.getText('content')
      provider = new WebsocketProvider(wsUrl, `file:${fileId}`, doc, {
        params: { token },
        connect: true,
      })
      providerRef.current = provider

      provider.on('status', (e: { status: string }) => setConnected(e.status === 'connected'))

      const color = colorFor(user.username)
      provider.awareness.setLocalStateField('user', {
        username: user.username,
        avatarUrl: user.avatarUrl,
        color,
      })

      const refreshPeers = () => {
        if (!provider) return
        const states = provider.awareness.getStates()
        const me = provider.awareness.clientID
        const list: Peer[] = []
        states.forEach((state, clientId) => {
          if (clientId === me) return
          const u = state.user
          if (!u) return
          list.push({ clientId, username: u.username, avatarUrl: u.avatarUrl ?? null, color: u.color ?? '#888' })
        })
        setPeers(list)
      }
      provider.awareness.on('change', refreshPeers)

      // Local origin token used to tag transactions we initiated so we don't
      // echo them back into the textarea via the observe handler.
      const LOCAL_ORIGIN = Symbol('local')

      // Seed the doc with the React-state content if the doc came up empty
      // (we're the first connector for this file). Wait for initial sync.
      provider.on('sync', (synced: boolean) => {
        if (!synced || !doc || !yText) return
        if (yText.length === 0 && initialContent.length > 0) {
          doc.transact(() => yText.insert(0, initialContent), LOCAL_ORIGIN)
        }
        // After sync, push whatever the doc has into the editor.
        const ta = textareaRef.current
        if (ta && ta.value !== yText.toString()) {
          applyRemoteString(ta, yText.toString())
          onChange(yText.toString())
        }
      })

      // Remote → local
      yText.observe(ev => {
        if (ev.transaction.origin === LOCAL_ORIGIN) return
        const ta = textareaRef.current
        if (!ta) return
        const next = yText.toString()
        if (ta.value === next) return
        applyRemoteString(ta, next)
        onChange(next)
      })

      // Local → remote: shadow the textarea via 'input' events. We don't
      // touch the existing onKeyDown/onChange React handlers — we listen
      // in parallel, compute a contiguous diff against the last-known
      // doc state, and apply it as a Yjs op.
      const ta = textareaRef.current
      if (ta) {
        let lastSeen = yText.toString()
        const handler = () => {
          if (!doc) return
          const cur = ta.value
          if (cur === lastSeen) return
          const op = computeOps(lastSeen, cur)
          if (!op) { lastSeen = cur; return }
          doc.transact(() => {
            if (op.remove > 0) yText.delete(op.index, op.remove)
            if (op.insert.length > 0) yText.insert(op.index, op.insert)
          }, LOCAL_ORIGIN)
          lastSeen = cur
        }
        ta.addEventListener('input', handler)
        // Re-sync lastSeen whenever a remote update lands (observe runs
        // before this; we just refresh after).
        const syncLastSeen = () => { lastSeen = yText.toString() }
        yText.observe(syncLastSeen)
        detachInput = () => {
          ta.removeEventListener('input', handler)
          yText.unobserve(syncLastSeen)
        }
      }

      refreshPeers()
    })()

    return () => {
      cancelled = true
      detachInput?.()
      provider?.awareness.setLocalState(null)
      provider?.destroy()
      doc?.destroy()
      providerRef.current = null
      setConnected(false)
      setPeers([])
    }
    // We intentionally don't depend on `initialContent` / `onChange` —
    // those would force a reconnect on every keystroke. The seed-on-empty
    // logic reads `initialContent` once during the async setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, user?.username])

  return { connected, peers }
}
