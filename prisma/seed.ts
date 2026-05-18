// Seeds initial autograder problems.
// Run with: npx ts-node --transpile-only prisma/seed.ts
// (or: npx tsx prisma/seed.ts)
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
  testCases: { stdin: string; expectedStdout: string }[]
}

const problems: SeedProblem[] = [
  {
    slug: 'hello-name',
    title: 'Hello, name',
    statement:
      'Read a name from input and output: Hello, <name>\n\n' +
      'Example:\n  Input:  Alice\n  Output: Hello, Alice',
    difficulty: 1,
    testCases: [
      { stdin: 'Alice\n', expectedStdout: 'Alice\nHello, Alice\n' },
      { stdin: 'Bob\n',   expectedStdout: 'Bob\nHello, Bob\n' },
    ],
  },
  {
    slug: 'sum-two',
    title: 'Sum of two numbers',
    statement:
      'Read two integers A and B (one per line). Output A + B.\n\n' +
      'Example:\n  Input:  3\n          4\n  Output: 7',
    difficulty: 1,
    testCases: [
      { stdin: '3\n4\n',     expectedStdout: '3\n4\n7\n' },
      { stdin: '10\n-3\n',   expectedStdout: '10\n-3\n7\n' },
      { stdin: '0\n0\n',     expectedStdout: '0\n0\n0\n' },
    ],
  },
  {
    slug: 'sum-to-n',
    title: 'Sum from 1 to N',
    statement:
      'Read a positive integer N. Output the sum 1 + 2 + ... + N.\n\n' +
      'Example:\n  Input:  5\n  Output: 15',
    difficulty: 2,
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
]

async function main() {
  for (const p of problems) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        statement: p.statement,
        difficulty: p.difficulty,
        testCases: p.testCases as any,
      },
      create: {
        slug: p.slug,
        title: p.title,
        statement: p.statement,
        difficulty: p.difficulty,
        testCases: p.testCases as any,
      },
    })
    console.log('seeded:', p.slug)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
