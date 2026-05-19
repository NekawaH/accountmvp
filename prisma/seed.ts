// Seeds initial autograder problems.
// Run with: npx tsx prisma/seed.ts
//
// IMPORTANT about expected outputs: the pseudocode interpreter echoes each
// INPUT value to stdout (followed by a newline) AND each OUTPUT statement
// appends a newline. So expected outputs below interleave both.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface SeedProblem {
  slug: string
  title: string
  statement: string
  difficulty: number
  examples: { input: string; output: string }[]
  testCases: { stdin: string; expectedStdout: string }[]
  maxSteps?: number
}

// Build a worst-case test for binary search: sorted distinct array [1..N],
// target at the last position. A correct O(log N) solution finishes in well
// under 2 s; a linear scan does N comparisons in the tree-walking interpreter
// and trips the per-case timeout.
function binarySearchStressCase(N: number, target: number) {
  const parts: string[] = [String(N)]
  for (let i = 1; i <= N; i++) parts.push(String(i))
  parts.push(String(target))
  const stdin = parts.join('\n') + '\n'
  // The interpreter echoes every INPUT value to stdout; the program then
  // outputs the 1-based index. Since array is [1..N], target's value equals
  // its index, so expected output = echoes + target + '\n'.
  const expectedStdout = stdin + String(target) + '\n'
  return { stdin, expectedStdout }
}

const problems: SeedProblem[] = [
  {
    slug: 'hello-name',
    title: 'Hello, name',
    statement: 'Read a name from input and output: Hello, <name>',
    difficulty: 1,
    examples: [{ input: 'Alice', output: 'Hello, Alice' }],
    testCases: [
      { stdin: 'Alice\n', expectedStdout: 'Alice\nHello, Alice\n' },
      { stdin: 'Bob\n',   expectedStdout: 'Bob\nHello, Bob\n' },
    ],
  },
  {
    slug: 'sum-two',
    title: 'Sum of two numbers',
    statement: 'Read two integers A and B (one per line). Output A + B.',
    difficulty: 1,
    examples: [{ input: '3\n4', output: '7' }],
    testCases: [
      { stdin: '3\n4\n',     expectedStdout: '3\n4\n7\n' },
      { stdin: '10\n-3\n',   expectedStdout: '10\n-3\n7\n' },
      { stdin: '0\n0\n',     expectedStdout: '0\n0\n0\n' },
    ],
  },
  {
    slug: 'sum-to-n',
    title: 'Sum from 1 to N',
    statement: 'Read a positive integer N. Output the sum 1 + 2 + ... + N.',
    difficulty: 2,
    examples: [{ input: '5', output: '15' }],
    testCases: [
      { stdin: '1\n',   expectedStdout: '1\n1\n' },
      { stdin: '5\n',   expectedStdout: '5\n15\n' },
      { stdin: '10\n',  expectedStdout: '10\n55\n' },
      { stdin: '100\n', expectedStdout: '100\n5050\n' },
    ],
  },
  {
    slug: 'fizzbuzz',
    title: 'FizzBuzz up to N',
    statement:
      'Read N. For each integer i from 1 to N output:\n' +
      '  - "FizzBuzz" if i is divisible by both 3 and 5\n' +
      '  - "Fizz" if divisible by 3\n' +
      '  - "Buzz" if divisible by 5\n' +
      '  - i otherwise\n' +
      'One value per line.',
    difficulty: 3,
    examples: [{ input: '5', output: '1\n2\nFizz\n4\nBuzz' }],
    testCases: [
      {
        stdin: '5\n',
        expectedStdout: '5\n1\n2\nFizz\n4\nBuzz\n',
      },
      {
        stdin: '15\n',
        expectedStdout:
          '15\n1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n',
      },
    ],
  },
  {
    slug: 'fibonacci',
    title: 'First N Fibonacci numbers',
    statement:
      'Read a positive integer N. Output the first N Fibonacci numbers, ' +
      'one per line. The sequence starts 1, 1, 2, 3, 5, 8, ...',
    difficulty: 2,
    examples: [{ input: '5', output: '1\n1\n2\n3\n5' }],
    testCases: [
      { stdin: '1\n',  expectedStdout: '1\n1\n' },
      { stdin: '2\n',  expectedStdout: '2\n1\n1\n' },
      { stdin: '5\n',  expectedStdout: '5\n1\n1\n2\n3\n5\n' },
      { stdin: '10\n', expectedStdout: '10\n1\n1\n2\n3\n5\n8\n13\n21\n34\n55\n' },
    ],
  },
  {
    slug: 'linear-search',
    title: 'Linear search',
    statement:
      'Read N, then N integers (one per line), then a target value X.\n' +
      'Output the 1-based index of the first occurrence of X in the list, ' +
      'or -1 if X is not present.',
    difficulty: 2,
    examples: [{ input: '5\n3\n7\n2\n9\n4\n9', output: '4' }],
    testCases: [
      { stdin: '5\n3\n7\n2\n9\n4\n9\n', expectedStdout: '5\n3\n7\n2\n9\n4\n9\n4\n' },
      { stdin: '3\n1\n2\n3\n5\n',       expectedStdout: '3\n1\n2\n3\n5\n-1\n' },
      { stdin: '4\n8\n1\n2\n8\n8\n',    expectedStdout: '4\n8\n1\n2\n8\n8\n1\n' },
      { stdin: '1\n42\n42\n',           expectedStdout: '1\n42\n42\n1\n' },
    ],
  },
  {
    slug: 'binary-search',
    title: 'Binary search',
    statement:
      'Read N, then N distinct integers sorted in ascending order (one per line), ' +
      'then a target value X.\n' +
      'Output the 1-based index of X in the list, or -1 if X is not present.\n' +
      '\n' +
      'You MUST implement binary search. There is a step limit on each test ' +
      'case — an O(N) linear scan over the large stress test will exceed it ' +
      'and be reported as "time limit exceeded".',
    difficulty: 3,
    // Step cap: a correct O(log N) solution on the 10 000-element stress test
    // executes ~30–35k execNode calls (dominated by the input read loop, plus
    // ~14 binary-search iterations). A linear scan adds another ~30k for the
    // scan body, pushing total above the cap.
    maxSteps: 45_000,
    examples: [{ input: '5\n1\n3\n5\n7\n9\n5', output: '3' }],
    testCases: [
      { stdin: '5\n1\n3\n5\n7\n9\n5\n',  expectedStdout: '5\n1\n3\n5\n7\n9\n5\n3\n' },
      { stdin: '5\n1\n3\n5\n7\n9\n4\n',  expectedStdout: '5\n1\n3\n5\n7\n9\n4\n-1\n' },
      { stdin: '4\n2\n4\n6\n8\n2\n',     expectedStdout: '4\n2\n4\n6\n8\n2\n1\n' },
      { stdin: '4\n2\n4\n6\n8\n8\n',     expectedStdout: '4\n2\n4\n6\n8\n8\n4\n' },
      { stdin: '1\n10\n10\n',            expectedStdout: '1\n10\n10\n1\n' },
      // Stress test: linear search blows the step cap; binary search clears it.
      binarySearchStressCase(10_000, 10_000),
    ],
  },
  {
    slug: 'sort-ascending',
    title: 'Sort ascending',
    statement:
      'Read N, then N integers (one per line). Output the same integers ' +
      'sorted in ascending order, one per line.',
    difficulty: 3,
    examples: [{ input: '5\n3\n1\n4\n1\n5', output: '1\n1\n3\n4\n5' }],
    testCases: [
      { stdin: '5\n3\n1\n4\n1\n5\n',   expectedStdout: '5\n3\n1\n4\n1\n5\n1\n1\n3\n4\n5\n' },
      { stdin: '4\n1\n2\n3\n4\n',      expectedStdout: '4\n1\n2\n3\n4\n1\n2\n3\n4\n' },
      { stdin: '5\n5\n4\n3\n2\n1\n',   expectedStdout: '5\n5\n4\n3\n2\n1\n1\n2\n3\n4\n5\n' },
      { stdin: '1\n42\n',              expectedStdout: '1\n42\n42\n' },
      { stdin: '4\n-2\n3\n-5\n0\n',    expectedStdout: '4\n-2\n3\n-5\n0\n-5\n-2\n0\n3\n' },
    ],
  },
  {
    slug: 'mean-median-mode',
    title: 'Mean, median, and mode',
    statement:
      'Read N, then N integers (one per line, given in arbitrary order — they ' +
      'are NOT pre-sorted). Output, on three separate lines:\n' +
      '  1. the mean (arithmetic average)\n' +
      '  2. the median (middle value when sorted; if N is even, the mean of ' +
      'the two middle values)\n' +
      '  3. the mode (most frequent value; if multiple tie, output the smallest)\n' +
      '\n' +
      'Guarantees: the mean and the median are always integers (so for even N ' +
      'the two middle values share parity, and the sum is always divisible by N).',
    difficulty: 4,
    examples: [
      { input: '5\n3\n1\n4\n2\n5', output: '3\n3\n1' },
      { input: '4\n40\n10\n30\n20', output: '25\n25\n10' },
    ],
    testCases: [
      // Odd N, unsorted, all distinct — no mode tie.
      { stdin: '5\n3\n1\n4\n2\n5\n',          expectedStdout: '5\n3\n1\n4\n2\n5\n3\n3\n1\n' },
      // Odd N, unsorted, mode tie broken by "smallest wins".
      { stdin: '5\n5\n2\n1\n5\n2\n',          expectedStdout: '5\n5\n2\n1\n5\n2\n3\n2\n2\n' },
      // Even N, unsorted, distinct — median = mean of two middles.
      { stdin: '4\n40\n10\n30\n20\n',         expectedStdout: '4\n40\n10\n30\n20\n25\n25\n10\n' },
      // Even N, unsorted, mode tie (1 and 5 tie → 1 wins), median = (2+4)/2 = 3.
      { stdin: '6\n4\n1\n5\n2\n5\n1\n',       expectedStdout: '6\n4\n1\n5\n2\n5\n1\n3\n3\n1\n' },
      // Even N with negatives — median = (-1+3)/2 = 1, all unique so smallest is mode.
      { stdin: '6\n5\n-2\n3\n-3\n-1\n4\n',    expectedStdout: '6\n5\n-2\n3\n-3\n-1\n4\n1\n1\n-3\n' },
      // Even N, all identical.
      { stdin: '4\n7\n7\n7\n7\n',             expectedStdout: '4\n7\n7\n7\n7\n7\n7\n7\n' },
      // N = 1 trivial edge.
      { stdin: '1\n42\n',                     expectedStdout: '1\n42\n42\n42\n42\n' },
    ],
  },
]

async function main() {
  for (const p of problems) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        statement: p.statement,
        difficulty: p.difficulty,
        examples: p.examples as any,
        testCases: p.testCases as any,
        maxSteps: p.maxSteps ?? null,
      },
      create: {
        slug: p.slug,
        title: p.title,
        statement: p.statement,
        difficulty: p.difficulty,
        examples: p.examples as any,
        testCases: p.testCases as any,
        maxSteps: p.maxSteps ?? null,
      },
    })
    console.log('seeded:', p.slug)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
