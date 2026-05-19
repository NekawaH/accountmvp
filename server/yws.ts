/**
 * Yjs WebSocket server for real-time co-editing of PseudoFile content.
 *
 * Run:  npm run dev:ws  (or  tsx server/yws.ts)
 *
 * Responsibilities:
 *   - Accept WS upgrades, authenticate via ?token=... (short-lived JWT
 *     minted by /api/realtime/token, signed with the same JWT_SECRET as
 *     lib/session.ts).
 *   - Route each connection to a doc room named `file:<fileId>`.
 *   - Authorize per file: edit access for owner+collaborators, read-only
 *     for public-workspace viewers.
 *   - Seed each freshly-loaded doc with the persisted PseudoFile.content.
 *   - Debounced persistence: 5s idle OR 30s max-wait → write content +
 *     call recordVersion(), attributed to the last writer.
 *   - On last-disconnect: flush immediately and dispose the doc.
 *
 * y-websocket@3 dropped its bundled server, so the Yjs sync + awareness
 * protocol is hand-rolled with y-protocols + lib0.
 */

import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { jwtVerify } from 'jose'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { prisma } from '../lib/prisma'
import { recordVersion } from '../lib/fileVersions'

// Constants tuned for collab editing UX vs DB load.

const PORT = Number(process.env.WS_PORT ?? 1234)
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('[yws] FATAL: JWT_SECRET not set')
  process.exit(1)
}
const secret = new TextEncoder().encode(JWT_SECRET)

const IDLE_FLUSH_MS = 5_000
const MAX_WAIT_FLUSH_MS = 30_000

// Outer message type tags (we choose them; client matches in useYjsTextarea)
const MSG_SYNC = 0
const MSG_AWARENESS = 1

// y-protocols/sync subtypes
const SYNC_STEP_1 = 0
const SYNC_STEP_2 = 1
const SYNC_UPDATE = 2

interface RoomConn {
  ws: WebSocket
  userId: string
  canWrite: boolean
}

interface Room {
  fileId: string
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Map<WebSocket, RoomConn>
  lastWriterId: string | null
  lastPersistedContent: string
  idleTimer: NodeJS.Timeout | null
  maxWaitTimer: NodeJS.Timeout | null
}

const rooms = new Map<string, Room>()

function send(ws: WebSocket, data: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(data, err => { if (err) console.warn('[yws] send error', err) })
}

function broadcast(room: Room, data: Uint8Array, exclude?: WebSocket) {
  room.conns.forEach((_c, ws) => { if (ws !== exclude) send(ws, data) })
}

async function getOrCreateRoom(fileId: string): Promise<Room> {
  const existing = rooms.get(fileId)
  if (existing) return existing

  const file = await prisma.pseudoFile.findUnique({ where: { id: fileId } })
  if (!file) throw new Error('file not found')

  const doc = new Y.Doc()
  const yText = doc.getText('content')
  if (file.content.length > 0) {
    doc.transact(() => yText.insert(0, file.content), 'server-seed')
  }

  const room: Room = {
    fileId,
    doc,
    awareness: new awarenessProtocol.Awareness(doc),
    conns: new Map(),
    lastWriterId: null,
    lastPersistedContent: file.content,
    idleTimer: null,
    maxWaitTimer: null,
  }

  // One listener handles attribution + broadcast + flush scheduling.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    let senderWs: WebSocket | undefined
    if (origin && typeof origin === 'object' && 'ws' in (origin as any)) {
      const o = origin as { ws: WebSocket; userId?: string }
      senderWs = o.ws
      if (o.userId) room.lastWriterId = o.userId
    }
    // skip flush for seed/restore origins, but DO broadcast them
    const isSystemOrigin = origin === 'server-seed' || origin === 'restore'

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const msg = encoding.toUint8Array(encoder)
    broadcast(room, msg, senderWs)

    if (!isSystemOrigin) scheduleFlush(room)
  })

  room.awareness.on('update', (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changed = added.concat(updated, removed)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
    )
    const msg = encoding.toUint8Array(encoder)
    const senderWs = origin instanceof WebSocket ? origin : undefined
    broadcast(room, msg, senderWs)
  })

  rooms.set(fileId, room)
  return room
}

function scheduleFlush(room: Room) {
  if (room.idleTimer) clearTimeout(room.idleTimer)
  room.idleTimer = setTimeout(() => flushRoom(room).catch(e => console.warn('[yws] flush error', e)), IDLE_FLUSH_MS)
  if (!room.maxWaitTimer) {
    room.maxWaitTimer = setTimeout(() => flushRoom(room).catch(e => console.warn('[yws] flush error', e)), MAX_WAIT_FLUSH_MS)
  }
}

async function flushRoom(room: Room) {
  if (room.idleTimer) { clearTimeout(room.idleTimer); room.idleTimer = null }
  if (room.maxWaitTimer) { clearTimeout(room.maxWaitTimer); room.maxWaitTimer = null }

  const content = room.doc.getText('content').toString()
  if (content === room.lastPersistedContent) return

  const author = room.lastWriterId
  try {
    await prisma.$transaction(async tx => {
      await tx.pseudoFile.update({ where: { id: room.fileId }, data: { content } })
      await recordVersion(room.fileId, content, author, null, tx)
    })
    room.lastPersistedContent = content
  } catch (err) {
    console.warn('[yws] persist failed for', room.fileId, err)
  }
}

async function authorize(userId: string, fileId: string): Promise<{ canRead: boolean; canWrite: boolean }> {
  const file = await prisma.pseudoFile.findUnique({
    where: { id: fileId },
    include: { workspace: { select: { isPublic: true, userId: true } } },
  })
  if (!file) return { canRead: false, canWrite: false }
  if (file.workspace.userId === userId) return { canRead: true, canWrite: true }
  const collab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId: file.workspaceId, userId } },
  })
  if (collab) return { canRead: true, canWrite: true }
  if (file.workspace.isPublic) return { canRead: true, canWrite: false }
  return { canRead: false, canWrite: false }
}

const server = http.createServer((_req, res) => { res.writeHead(200); res.end('yjs ws server') })
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    const pathname = url.pathname.replace(/^\/+/, '')
    if (!token || !pathname.startsWith('file:')) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return
    }
    const fileId = pathname.slice('file:'.length)

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.sub as string | undefined
    if (!userId) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }

    const { canRead, canWrite } = await authorize(userId, fileId)
    if (!canRead) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }

    wss.handleUpgrade(req, socket, head, ws => {
      attachConnection(ws, fileId, userId, canWrite).catch(err => {
        console.warn('[yws] attach error', err)
        ws.close()
      })
    })
  } catch (err) {
    console.warn('[yws] upgrade rejected', err)
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

async function attachConnection(ws: WebSocket, fileId: string, userId: string, canWrite: boolean) {
  const room = await getOrCreateRoom(fileId)
  const conn: RoomConn = { ws, userId, canWrite }
  room.conns.set(ws, conn)
  // Track which awareness clientIDs this conn has reported, so we can clean
  // them up on disconnect without waiting for awareness timeout.
  const ownedAwarenessIds = new Set<number>()

  // Send our sync step 1 (request peer state + provide our state vector).
  {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeSyncStep1(encoder, room.doc)
    send(ws, encoding.toUint8Array(encoder))
  }
  // Send current awareness state if any.
  {
    const states = room.awareness.getStates()
    if (states.size > 0) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      )
      send(ws, encoding.toUint8Array(encoder))
    }
  }

  ws.on('message', (raw: Buffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(raw))
      const type = decoding.readVarUint(decoder)

      if (type === MSG_SYNC) {
        const sub = decoding.readVarUint(decoder)
        if (sub === SYNC_STEP_1) {
          // Peer asks for our state; respond with step 2 (diff).
          const sv = decoding.readVarUint8Array(decoder)
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MSG_SYNC)
          encoding.writeVarUint(encoder, SYNC_STEP_2)
          encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(room.doc, sv))
          send(ws, encoding.toUint8Array(encoder))
        } else if (sub === SYNC_STEP_2 || sub === SYNC_UPDATE) {
          // Peer is sending state. Drop silently if read-only.
          if (!canWrite) return
          const update = decoding.readVarUint8Array(decoder)
          // Origin object lets our doc.update listener (a) skip echoing
          // back to the sender, and (b) tag lastWriterId with userId.
          Y.applyUpdate(room.doc, update, { ws, userId })
        }
      } else if (type === MSG_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder)
        // Decode the client IDs reported so we can clean them up on close.
        try {
          const d2 = decoding.createDecoder(update)
          const count = decoding.readVarUint(d2)
          for (let i = 0; i < count; i++) {
            const cid = decoding.readVarUint(d2)
            ownedAwarenessIds.add(cid)
            decoding.readVarUint(d2)               // clock
            decoding.readVarString(d2)             // state JSON
          }
        } catch { /* ignore parse drift */ }
        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws)
      }
    } catch (err) {
      console.warn('[yws] message handler error', err)
    }
  })

  ws.on('close', async () => {
    room.conns.delete(ws)
    if (ownedAwarenessIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ownedAwarenessIds), null)
    }
    if (room.conns.size === 0) {
      await flushRoom(room).catch(err => console.warn('[yws] final flush error', err))
      room.doc.destroy()
      room.awareness.destroy()
      rooms.delete(room.fileId)
    }
  })

  ws.on('error', err => console.warn('[yws] ws error', err))
}

async function shutdown() {
  console.log('[yws] shutting down, flushing', rooms.size, 'docs…')
  await Promise.all(Array.from(rooms.values()).map(r => flushRoom(r).catch(() => {})))
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, () => {
  console.log(`[yws] listening on :${PORT}`)
})
