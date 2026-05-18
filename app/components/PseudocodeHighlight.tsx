'use client'

import { ReactNode, CSSProperties } from 'react'

const KEYWORDS = new Set([
  'DECLARE', 'CONSTANT', 'IF', 'THEN', 'ELSE', 'ENDIF',
  'FOR', 'TO', 'STEP', 'NEXT',
  'WHILE', 'DO', 'ENDWHILE', 'REPEAT', 'UNTIL',
  'PROCEDURE', 'ENDPROCEDURE', 'FUNCTION', 'ENDFUNCTION',
  'RETURNS', 'RETURN', 'CALL',
  'INPUT', 'OUTPUT',
  'CASE', 'OF', 'OTHERWISE', 'ENDCASE',
  'OPENFILE', 'READFILE', 'WRITEFILE', 'CLOSEFILE',
  'BYREF', 'BYVAL',
  'AND', 'OR', 'NOT', 'MOD', 'DIV',
  'READ', 'WRITE', 'APPEND',
])

const TYPES = new Set([
  'INTEGER', 'REAL', 'STRING', 'CHAR', 'BOOLEAN', 'ARRAY', 'DATE',
])

const CONSTS = new Set(['TRUE', 'FALSE', 'NULL'])

// Token order matters — comments / strings first, then numbers, identifiers, operators.
const TOKEN_RE =
  /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)|(<-|<=|>=|<>|[+\-*/^=<>():,\[\]\.])|(\s+)|([\s\S])/g

export function highlightPseudocode(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let m: RegExpExecArray | null
  let i = 0
  // Always reset lastIndex since regex has /g flag.
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(code))) {
    const [, comment, str, ch, num, ident, op, ws, other] = m
    if (comment !== undefined) {
      out.push(<span key={i++} style={{ color: '#6b7280', fontStyle: 'italic' }}>{comment}</span>)
    } else if (str !== undefined) {
      out.push(<span key={i++} style={{ color: '#15803d' }}>{str}</span>)
    } else if (ch !== undefined) {
      out.push(<span key={i++} style={{ color: '#15803d' }}>{ch}</span>)
    } else if (num !== undefined) {
      out.push(<span key={i++} style={{ color: '#c2410c' }}>{num}</span>)
    } else if (ident !== undefined) {
      if (KEYWORDS.has(ident)) {
        out.push(<span key={i++} style={{ color: '#7e22ce', fontWeight: 600 }}>{ident}</span>)
      } else if (TYPES.has(ident)) {
        out.push(<span key={i++} style={{ color: '#1d4ed8', fontWeight: 600 }}>{ident}</span>)
      } else if (CONSTS.has(ident)) {
        out.push(<span key={i++} style={{ color: '#c2410c' }}>{ident}</span>)
      } else {
        out.push(<span key={i++}>{ident}</span>)
      }
    } else if (op !== undefined) {
      out.push(<span key={i++} style={{ color: '#db2777' }}>{op}</span>)
    } else if (ws !== undefined) {
      out.push(ws)
    } else if (other !== undefined) {
      out.push(other)
    }
  }
  return out
}

/**
 * Renders a <pre> with highlighted pseudocode that can be placed underneath a
 * transparent <textarea> as a syntax-highlighting overlay. Caller is responsible
 * for matching font / padding / line-height with the textarea on top.
 */
export function HighlightedPseudocode({
  code,
  style,
  className,
}: {
  code: string
  style?: CSSProperties
  className?: string
}) {
  // A trailing newline ensures the last empty line still has rendered height
  // matching the textarea.
  const safe = code.endsWith('\n') ? code + ' ' : code
  return (
    <pre
      aria-hidden="true"
      className={className}
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {highlightPseudocode(safe)}
    </pre>
  )
}
