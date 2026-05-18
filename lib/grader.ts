// Server-side autograder for pseudocode submissions.
// Loads /public/pseudorunner/async_interpreter.js inside a Node vm sandbox
// with minimal window/DOM stubs, then runs the user's code against each test
// case (stdin -> expectedStdout) with a per-case timeout.

import fs from 'fs'
import path from 'path'
import vm from 'vm'

export interface TestCase {
  stdin: string
  expectedStdout: string
}

export interface CaseResult {
  passed: boolean
  actualStdout: string
  error?: string
  timedOut?: boolean
  stepLimitExceeded?: boolean
}

export interface GradeResult {
  testsPassed: number
  testsTotal: number
  passed: boolean
  cases: CaseResult[]
}

const PER_CASE_TIMEOUT_MS = 1

let cachedSource: string | null = null
function loadInterpreterSource(): string {
  if (cachedSource) return cachedSource
  const p = path.join(process.cwd(), 'public', 'pseudorunner', 'async_interpreter.js')
  cachedSource = fs.readFileSync(p, 'utf8')
  return cachedSource
}

function normalize(s: string): string {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

async function runCase(code: string, stdin: string, maxSteps: number): Promise<CaseResult> {
  const sandbox: any = {
    console, setTimeout, clearTimeout, setImmediate, clearImmediate,
    Promise, queueMicrotask,
    document: { getElementById: (_id: string) => null },
  }
  sandbox.window = sandbox
  vm.createContext(sandbox)

  try {
    vm.runInContext(loadInterpreterSource(), sandbox, { filename: 'async_interpreter.js' })
  } catch (e: any) {
    return { passed: false, actualStdout: '', error: 'interpreter load failed: ' + e.message }
  }

  const pseudoIDE = sandbox.pseudoIDE
  if (!pseudoIDE) {
    return { passed: false, actualStdout: '', error: 'interpreter did not register' }
  }

  const lines = stdin.replace(/\r/g, '').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  let inputIdx = 0

  let output = ''
  const outputEl = {
    get textContent() { return output },
    set textContent(v: string) { output = v },
    scrollTop: 0,
    scrollHeight: 0,
  }

  let keydownHandler: ((e: any) => void) | null = null
  const inputEl: any = {
    value: '',
    focus() {
      queueMicrotask(() => {
        if (!keydownHandler) return
        const next = inputIdx < lines.length ? lines[inputIdx++] : ''
        inputEl.value = next
        keydownHandler({ key: 'Enter' })
      })
    },
    addEventListener(_event: string, handler: (e: any) => void) {
      keydownHandler = handler
    },
  }

  pseudoIDE.init(outputEl, inputEl)
  if (maxSteps > 0 && typeof pseudoIDE.setStepLimit === 'function') {
    pseudoIDE.setStepLimit(maxSteps)
  }

  let timedOut = false
  const runPromise = (pseudoIDE.run(code, null) as Promise<any>).catch((e: any) => {
    output += '\nError: ' + (e?.message ?? String(e))
  })
  const timeoutPromise = new Promise<void>(resolve =>
    setTimeout(() => { timedOut = true; resolve() }, PER_CASE_TIMEOUT_MS)
  )
  await Promise.race([runPromise, timeoutPromise])

  if (timedOut) {
    return { passed: false, actualStdout: output, timedOut: true, error: 'time limit exceeded' }
  }
  const stepLimitExceeded = !!pseudoIDE.lastRun?.stepLimitExceeded
  if (stepLimitExceeded) {
    return {
      passed: false,
      actualStdout: output,
      stepLimitExceeded: true,
      error: 'time limit exceeded',
    }
  }
  return { passed: false, actualStdout: output }
}

export async function grade(code: string, testCases: TestCase[], maxSteps = 0): Promise<GradeResult> {
  const cases: CaseResult[] = []
  let passedCount = 0
  for (const tc of testCases) {
    const r = await runCase(code, tc.stdin, maxSteps)
    const passed = !r.error && !r.timedOut && !r.stepLimitExceeded
      && normalize(r.actualStdout) === normalize(tc.expectedStdout)
    if (passed) passedCount++
    cases.push({ ...r, passed })
  }
  return {
    testsPassed: passedCount,
    testsTotal: testCases.length,
    passed: testCases.length > 0 && passedCount === testCases.length,
    cases,
  }
}
