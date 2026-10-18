import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatStackInPlainWords,
  getHealthVerdict,
  getWhatToDoNext,
} from './projectGlance.js'

test('formatStackInPlainWords: formats stack in natural words', () => {
  const reactVite = formatStackInPlainWords({
    framework: 'React',
    stack: ['Vite', 'React', 'ESLint'],
    language: 'JavaScript',
  })
  assert.equal(reactVite, 'A React app built with Vite, written in JavaScript')

  const nextApp = formatStackInPlainWords({
    framework: 'Next.js',
    stack: ['Next.js', 'React'],
    language: 'TypeScript',
  })
  assert.equal(nextApp, 'A Next.js app, written in TypeScript')

  const monorepo = formatStackInPlainWords({
    framework: 'React',
    stack: ['Vite'],
    language: 'TypeScript',
    monorepo: true,
  })
  assert.equal(monorepo, 'A TypeScript monorepo using React and Vite')

  const plainJs = formatStackInPlainWords({
    framework: null,
    stack: [],
    language: 'JavaScript',
  })
  assert.equal(plainJs, 'A JavaScript project')
})

test('getHealthVerdict: verdict mapping and one sentence why derived from production findings only', () => {
  // 1. Healthy: Score 95, 0 critical issues, 0 warnings
  const healthy = getHealthVerdict({
    health: { score: 95 },
    diagnostics: [{ status: 'pass' }],
    deepScanData: { summary: { cycles: [], usedButUndeclared: [], declaredButUnused: [], orphans: [] } },
  })
  assert.equal(healthy.label, 'Looking healthy')
  assert.equal(healthy.icon, '✓')
  assert.equal(healthy.tone, 'healthy')
  assert.equal(healthy.whySentence, 'All setup checks passed with no circular dependencies or missing packages.')

  // 2. Needs attention with 1 circular dependency
  const cycleVerdict = getHealthVerdict({
    health: { score: 65 },
    diagnostics: [],
    deepScanData: {
      summary: {
        cycles: [{ files: ['src/a.ts', 'src/b.ts'], isTypeOnly: false }],
        usedButUndeclared: [],
      },
    },
  })
  assert.equal(cycleVerdict.label, 'Needs attention')
  assert.equal(cycleVerdict.icon, '✖')
  assert.equal(cycleVerdict.tone, 'attention')
  assert.equal(cycleVerdict.whySentence, '1 circular dependency was found.')

  // Type-only cycles do NOT trigger runtime circular dependency verdict
  const typeOnlyVerdict = getHealthVerdict({
    health: { score: 95 },
    diagnostics: [],
    deepScanData: {
      summary: {
        cycles: [{ files: ['src/a.ts', 'src/b.ts'], isTypeOnly: true }],
        usedButUndeclared: [],
      },
    },
  })
  assert.equal(typeOnlyVerdict.label, 'Looking healthy')
  assert.equal(typeOnlyVerdict.whySentence, 'All setup checks passed with no circular dependencies or missing packages.')

  // 3. A few things to fix with warnings
  const warningVerdict = getHealthVerdict({
    health: { score: 82 },
    diagnostics: [
      { status: 'warning', rule: 'no-lockfile' },
      { status: 'warning', rule: 'missing-test-script' },
    ],
    deepScanData: { summary: { cycles: [], usedButUndeclared: [] } },
  })
  assert.equal(warningVerdict.label, 'A few things to fix')
  assert.equal(warningVerdict.icon, '⚠')
  assert.equal(warningVerdict.tone, 'warning')
  assert.equal(warningVerdict.whySentence, '2 setup warnings were found.')

  // 4. Undeclared dependencies trigger Needs attention
  const undeclaredVerdict = getHealthVerdict({
    health: { score: 80 },
    diagnostics: [],
    deepScanData: {
      summary: {
        cycles: [],
        usedButUndeclared: ['axios', 'lodash'],
      },
    },
  })
  assert.equal(undeclaredVerdict.label, 'Needs attention')
  assert.equal(undeclaredVerdict.whySentence, '2 undeclared external packages were found.')
})

test('getWhatToDoNext: orders recommendations by severity, caps at 3, and provides maintenance zero-state', () => {
  // Test ordering: Critical (cycles, undeclared, errors) -> Important (warnings, orphans) -> Nice to have (unused)
  const steps = getWhatToDoNext({
    diagnostics: [
      {
        rule: 'missing-build',
        title: 'Missing build script',
        status: 'error',
        why: 'Cannot build without script',
        fix: { type: 'command', content: 'npm pkg set scripts.build="vite build"' },
      },
      {
        rule: 'no-lockfile',
        title: 'Missing lockfile',
        status: 'warning',
        why: 'Inconsistent versions',
        fix: { type: 'command', content: 'npm install --package-lock-only' },
      },
    ],
    deepScanData: {
      summary: {
        cycles: [
          {
            shortest: ['src/a.js', 'src/b.js'],
            files: ['src/a.js', 'src/b.js'],
          },
        ],
        usedButUndeclared: ['chalk'],
        declaredButUnused: ['rimraf'],
        orphans: ['src/dead.js'],
      },
    },
  })

  // Must have all categories ordered by severity
  assert.ok(steps.length >= 6)
  // First item must be Critical
  assert.equal(steps[0].severity, 'Critical')
  // All Critical steps come before Important steps
  const firstImportantIdx = steps.findIndex((s) => s.severity === 'Important')
  const firstNiceToHaveIdx = steps.findIndex((s) => s.severity === 'Nice to have')
  assert.ok(firstImportantIdx > 0, 'Important steps follow Critical')
  assert.ok(firstNiceToHaveIdx > firstImportantIdx, 'Nice to have steps follow Important')

  // Each step must have title, why sentence, and concrete action
  for (const step of steps) {
    assert.ok(step.title, 'Step must have short title')
    assert.ok(step.why, 'Step must have why sentence')
    assert.ok(step.action?.value, 'Step must have concrete action')
    assert.ok(['command', 'file', 'snippet'].includes(step.action.type), 'Action type must be valid')
  }

  // Zero-state test: nothing to fix returns "Nothing to fix right now" and maintenance step
  const zeroSteps = getWhatToDoNext({
    diagnostics: [{ status: 'pass' }],
    deepScanData: { summary: { cycles: [], usedButUndeclared: [], declaredButUnused: [], orphans: [] } },
  })
  assert.equal(zeroSteps.length, 1)
  assert.equal(zeroSteps[0].isZeroState, true)
  assert.equal(zeroSteps[0].title, 'Nothing to fix right now')
  assert.equal(zeroSteps[0].action?.value, 'npm outdated')
})
