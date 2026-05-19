/**
 * Pure utilities for syncing a Y.Text doc with a plain <textarea>.
 *
 * Two concerns kept separate from React/Yjs:
 *  - `computeOps(prev, next)`: derive the single contiguous insert/delete that
 *    turned `prev` into `next`. Sufficient for typing, paste, cut, Tab indent;
 *    not for non-contiguous multi-cursor edits (the textarea can't produce
 *    those anyway).
 *  - `applyRemoteString(textarea, nextValue)`: replace the textarea's value
 *    while preserving the user's caret/selection against the same diff.
 */

export interface TextOp {
  /** Position in `prev` where the change begins. */
  index: number
  /** Number of characters removed from `prev` starting at `index`. */
  remove: number
  /** Characters inserted at `index` (after removal). */
  insert: string
}

function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

function commonSuffixLen(a: string, b: string, prefix: number): number {
  let i = 0
  const maxA = a.length - prefix
  const maxB = b.length - prefix
  const max = Math.min(maxA, maxB)
  while (i < max && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++
  return i
}

export function computeOps(prev: string, next: string): TextOp | null {
  if (prev === next) return null
  const p = commonPrefixLen(prev, next)
  const s = commonSuffixLen(prev, next, p)
  return {
    index: p,
    remove: prev.length - p - s,
    insert: next.slice(p, next.length - s),
  }
}

/**
 * Apply `nextValue` to the textarea while keeping the user's caret/selection
 * anchored sensibly:
 *   - characters before the edit region: caret unchanged
 *   - characters inside the edit region: caret clamped to the new boundary
 *   - characters after the edit region: caret shifted by (insert - remove)
 */
export function applyRemoteString(ta: HTMLTextAreaElement, nextValue: string): void {
  const prev = ta.value
  if (prev === nextValue) return
  const op = computeOps(prev, nextValue)
  if (!op) return

  const selStart = ta.selectionStart ?? 0
  const selEnd = ta.selectionEnd ?? 0
  const editEnd = op.index + op.remove
  const delta = op.insert.length - op.remove

  const adjust = (pos: number): number => {
    if (pos <= op.index) return pos
    if (pos >= editEnd) return pos + delta
    // caret inside the replaced span → clamp to the end of the inserted text
    return op.index + op.insert.length
  }

  const wasActive = document.activeElement === ta
  ta.value = nextValue
  if (wasActive) {
    const newStart = adjust(selStart)
    const newEnd = adjust(selEnd)
    ta.setSelectionRange(newStart, newEnd)
  }
}
