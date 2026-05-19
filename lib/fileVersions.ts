import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Coalesce window: a same-author save within this many ms of the previous
 * version (and without an explicit commit message) updates the previous row
 * in place instead of creating a new one. Prevents history bloat from
 * autosave / rapid Save-button bursts while still preserving distinct edits
 * across authors, longer time gaps, and named commits.
 */
const COALESCE_WINDOW_MS = 30_000

type PrismaTx = Prisma.TransactionClient | PrismaClient

/**
 * Record a version of a PseudoFile's content. Idempotent against no-op saves.
 *
 * - If the latest existing version already has identical content, does nothing.
 * - If the latest version is by the same author, within the coalesce window,
 *   and no explicit `message` was provided, updates that row's content + timestamp.
 * - Otherwise inserts a new FileVersion row.
 *
 * Pass a `tx` (transaction client) when composing with a content write so the
 * snapshot and the write succeed-or-fail together.
 */
export async function recordVersion(
  fileId: string,
  content: string,
  authorId: string | null,
  message: string | null = null,
  tx: PrismaTx = prisma,
) {
  const latest = await tx.fileVersion.findFirst({
    where: { fileId },
    orderBy: { createdAt: 'desc' },
  })

  if (latest && latest.content === content) return latest

  const now = Date.now()
  const canCoalesce =
    latest &&
    !message &&
    latest.authorId === authorId &&
    now - latest.createdAt.getTime() < COALESCE_WINDOW_MS

  if (canCoalesce && latest) {
    return tx.fileVersion.update({
      where: { id: latest.id },
      data: { content, createdAt: new Date(now) },
    })
  }

  return tx.fileVersion.create({
    data: { fileId, content, authorId, message },
  })
}
