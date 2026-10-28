import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatStackInPlainWords,
  getHealthVerdict,
  getWhatToDoNext,
  generateProjectStory,
  calculateRiskiestFiles,
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

test('formatStackInPlainWords: capitalizes known names (React, Vue, Svelte, Vite, TypeScript, JavaScript, Node.js)', () => {
  // Lowercase react and javascript
  const reactApp = formatStackInPlainWords({
    framework: 'react',
    stack: ['vite', 'react'],
    language: 'javascript',
  })
  assert.equal(reactApp, 'A React app built with Vite, written in JavaScript')

  // Vue
  const vueApp = formatStackInPlainWords({
    framework: 'vue',
    stack: ['vite', 'vue'],
    language: 'typescript',
  })
  assert.equal(vueApp, 'A Vue app built with Vite, written in TypeScript')

  // Svelte
  const svelteApp = formatStackInPlainWords({
    framework: 'svelte',
    stack: ['vite', 'svelte'],
    language: 'javascript',
  })
  assert.equal(svelteApp, 'A Svelte app built with Vite, written in JavaScript')

  // Node.js
  const nodeProject = formatStackInPlainWords({
    framework: null,
    stack: ['node'],
    language: 'node.js',
  })
  assert.equal(nodeProject, 'A Node.js project')
})

test('formatStackInPlainWords: deduplicates stack names case-insensitively and never repeats ("vite and Vite")', () => {
  // Case-insensitive duplicates in stack array
  const monorepoDedupe = formatStackInPlainWords({
    framework: 'vite',
    stack: ['vite', 'Vite'],
    language: 'TypeScript',
    monorepo: true,
  })
  assert.ok(!monorepoDedupe.toLowerCase().includes('vite and vite'))
  assert.equal(monorepoDedupe, 'A TypeScript monorepo using Vite')

  // Framework and bundler match (Vite app built with Vite prevented)
  const appDedupe = formatStackInPlainWords({
    framework: 'Vite',
    stack: ['vite', 'Vite'],
    language: 'JavaScript',
  })
  assert.equal(appDedupe, 'A Vite app, written in JavaScript')

  // Stack containing lowercase and uppercase variants with React
  const mixedStack = formatStackInPlainWords({
    framework: 'React',
    stack: ['vite', 'Vite', 'react', 'React'],
    language: 'JavaScript',
  })
  assert.equal(mixedStack, 'A React app built with Vite, written in JavaScript')
})

test('getHealthVerdict: verdict mapping and one sentence why derived from production findings only', () => {
  // 1. Healthy: Score 95, 0 critical issues, 0 warnings -> score is shown because computed from same findings
  const healthy = getHealthVerdict({
    health: { score: 95 },
    diagnostics: [{ status: 'pass' }],
    deepScanData: { summary: { cycles: [], usedButUndeclared: [], declaredButUnused: [], orphans: [] } },
  })
  assert.equal(healthy.label, 'Looking healthy')
  assert.equal(healthy.icon, '✓')
  assert.equal(healthy.tone, 'healthy')
  assert.equal(healthy.whySentence, 'All setup checks passed with no circular dependencies or missing packages.')
  assert.equal(healthy.showScore, true)
  assert.equal(healthy.score, 95)

  // 2. A few things to fix with 1 circular dependency -> capped at B (1 cycle)
  const cycleVerdict = getHealthVerdict({
    health: { score: 95 },
    diagnostics: [],
    deepScanData: {
      summary: {
        cycles: [{ files: ['src/a.ts', 'src/b.ts'], isTypeOnly: false }],
        usedButUndeclared: [],
      },
    },
  })
  assert.equal(cycleVerdict.label, 'A few things to fix')
  assert.equal(cycleVerdict.icon, '⚠')
  assert.equal(cycleVerdict.tone, 'warning')
  assert.equal(cycleVerdict.whySentence, '1 circular dependency was found.')
  assert.equal(cycleVerdict.grade, 'B')
  assert.equal(cycleVerdict.capReason, 'Capped at B by Reliability: 1 runtime cycle')
  assert.equal(cycleVerdict.gradeText, 'Capped at B by Reliability: 1 runtime cycle')
  assert.equal(cycleVerdict.showScore, true)
  assert.equal(cycleVerdict.score, 89)

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
  assert.equal(typeOnlyVerdict.showScore, true)
  assert.equal(typeOnlyVerdict.score, 95)

  // 3. A few things to fix with warnings only (0 graph issues) -> score is shown because computed from same findings
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
  assert.equal(warningVerdict.showScore, true)
  assert.equal(warningVerdict.score, 82)

  // 4. Undeclared dependencies trigger Needs attention and cap at C
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
  assert.equal(undeclaredVerdict.label, 'A few things to fix')
  assert.equal(undeclaredVerdict.whySentence, '2 undeclared packages were found.')
  assert.equal(undeclaredVerdict.grade, 'C')
  assert.equal(undeclaredVerdict.capReason, 'Capped at C by Security: 2 undeclared packages')
  assert.equal(undeclaredVerdict.gradeText, 'Capped at C by Security: 2 undeclared packages')
  assert.equal(undeclaredVerdict.showScore, true)
  assert.equal(undeclaredVerdict.score, 79)

  // 5. Critical setup error triggers Needs attention (0 graph issues) -> score is shown
  const errorVerdict = getHealthVerdict({
    health: { score: 60 },
    diagnostics: [{ status: 'error', rule: 'missing-build' }],
    deepScanData: { summary: { cycles: [], usedButUndeclared: [] } },
  })
  assert.equal(errorVerdict.label, 'Needs attention')
  assert.equal(errorVerdict.whySentence, '1 critical setup issue was found.')
  assert.equal(errorVerdict.showScore, true)
  assert.equal(errorVerdict.score, 60)
})

test('getHealthVerdict: loading state ("scanning") hides score and does not declare verdict on cycles/orphans/deps', () => {
  const loading = getHealthVerdict({
    health: { score: 100 },
    diagnostics: [{ status: 'pass' }],
    deepScanStatus: 'scanning',
  })
  assert.equal(loading.label, 'Scanning code...')
  assert.equal(loading.icon, '⏳')
  assert.equal(loading.whySentence, 'Setup checks passed. Scanning code for circular dependencies and imports...')
  assert.equal(loading.showScore, false)
  assert.equal(loading.score, null)

  const loadingWithErrors = getHealthVerdict({
    health: { score: 60 },
    diagnostics: [{ status: 'error', rule: 'missing-build' }],
    deepScanStatus: 'scanning',
  })
  assert.equal(loadingWithErrors.label, 'Needs attention')
  assert.ok(loadingWithErrors.whySentence.includes('Scanning code for circular dependencies and imports...'))
  assert.equal(loadingWithErrors.showScore, false)
  assert.equal(loadingWithErrors.score, null)
})

test('getHealthVerdict: unavailable state ("error" or missing) shows score and notes Code Map is unavailable', () => {
  const unavailableError = getHealthVerdict({
    health: { score: 100 },
    diagnostics: [{ status: 'pass' }],
    deepScanStatus: 'error',
  })
  assert.equal(unavailableError.label, 'A few things to fix')
  assert.equal(unavailableError.whySentence, 'Code Map unavailable, so this verdict covers setup checks only.')
  assert.equal(unavailableError.grade, 'B')
  assert.equal(unavailableError.capReason, 'Code Map scan failed')
  assert.equal(unavailableError.gradeText, 'Grade B (capped: Code Map scan failed)')
  assert.equal(unavailableError.showScore, true)
  assert.equal(unavailableError.score, 89)

  const unavailableMissing = getHealthVerdict({
    health: { score: 80 },
    diagnostics: [{ status: 'warning', rule: 'missing-license' }],
    deepScanData: null,
    deepScanStatus: 'idle',
  })
  assert.equal(unavailableMissing.label, 'A few things to fix')
  assert.equal(unavailableMissing.whySentence, 'Code Map unavailable, so this verdict covers setup checks only.')
  assert.equal(unavailableMissing.showScore, true)
  assert.equal(unavailableMissing.score, 80)
})

test('clean repo: reaches grade A with no caps', () => {
  const cleanDiag = [{ status: 'pass' }]
  const cleanDeepScan = {
    coverage: { graphFiles: 50 },
    summary: {
      cycles: [],
      usedButUndeclared: [],
      declaredButUnused: [],
      orphans: [],
      unresolvedImports: [],
    },
  }

  const verdict = getHealthVerdict({
    health: { score: 100 },
    diagnostics: cleanDiag,
    deepScanData: cleanDeepScan,
  })

  assert.equal(verdict.label, 'Looking healthy')
  assert.equal(verdict.grade, 'A')
  assert.equal(verdict.capReason, null)
  assert.equal(verdict.gradeText, 'Grade A')
  assert.equal(verdict.score, 100)
  assert.equal(verdict.showScore, true)
})

test('undeclared package: caps at C', () => {
  const diag = [{ status: 'pass' }]
  const deepScan = {
    coverage: { graphFiles: 50 },
    summary: {
      cycles: [],
      usedButUndeclared: ['axios'],
      declaredButUnused: [],
      orphans: [],
      unresolvedImports: [],
    },
  }

  const verdict = getHealthVerdict({
    health: { score: 100 },
    diagnostics: diag,
    deepScanData: deepScan,
  })

  assert.equal(verdict.label, 'A few things to fix')
  assert.equal(verdict.grade, 'C')
  assert.equal(verdict.capReason, 'Capped at C by Security: 1 undeclared package')
  assert.equal(verdict.gradeText, 'Capped at C by Security: 1 undeclared package')
  assert.equal(verdict.score, 79)
  assert.equal(verdict.showScore, true)
})

test('truncated scan: caps at B', () => {
  const diag = [{ status: 'pass' }]
  const deepScan = {
    coverage: { graphFiles: 500, truncated: true },
    truncated: true,
    summary: {
      cycles: [],
      usedButUndeclared: [],
      declaredButUnused: [],
      orphans: [],
      unresolvedImports: [],
    },
  }

  const verdict = getHealthVerdict({
    health: { score: 100 },
    diagnostics: diag,
    deepScanData: deepScan,
  })

  assert.equal(verdict.label, 'A few things to fix')
  assert.equal(verdict.grade, 'B')
  assert.equal(verdict.capReason, 'Capped at B by Reliability: Code Map scan truncated')
  assert.equal(verdict.gradeText, 'Capped at B by Reliability: Code Map scan truncated')
  assert.equal(verdict.score, 89)
  assert.equal(verdict.showScore, true)
})

test('vite-shaped response: is capped at B because of runtime cycles', () => {
  const viteDiag = [{ status: 'pass' }]
  const viteDeepScan = {
    coverage: { graphFiles: 1781 },
    summary: {
      cycles: [
        {
          shortest: ['packages/vite/src/node/packages.ts', 'packages/vite/src/node/utils.ts'],
          files: ['packages/vite/src/node/packages.ts', 'packages/vite/src/node/utils.ts'],
          isTypeOnly: false,
        },
        {
          shortest: ['packages/vite/src/node/plugins/index.ts', 'packages/vite/src/node/build.ts'],
          files: ['packages/vite/src/node/plugins/index.ts', 'packages/vite/src/node/build.ts'],
          isTypeOnly: false,
        },
      ],
      orphans: ['packages/vite/src/client/overlay.ts', 'packages/vite/src/node/optimizer/register.js'],
      declaredButUnused: ['rollup', 'esbuild', 'postcss', 'sass', 'less', 'stylus', 'chokidar', 'ws', 'dotenv', 'sirv'],
      usedButUndeclared: [],
      unresolvedImports: [
        { from: 'packages/vite/src/node/index.ts', specifier: '../types.js', reason: 'relative-not-found', category: 'production' },
        { from: 'packages/vite/src/node/server/moduleGraph.ts', specifier: 'vite/types/customEvent.js', reason: 'relative-not-found', category: 'production' },
      ],
      unresolvedCount: 2,
    },
  }

  const verdict = getHealthVerdict({
    health: { score: 100 },
    diagnostics: viteDiag,
    deepScanData: viteDeepScan,
  })

  assert.equal(verdict.label, 'A few things to fix')
  assert.equal(verdict.grade, 'B')
  assert.equal(verdict.capReason, 'Capped at B by Reliability: 2 runtime cycles')
  assert.equal(verdict.gradeText, 'Capped at B by Reliability: 2 runtime cycles')
  assert.equal(verdict.showScore, true)
  assert.equal(verdict.score, 89)
  assert.ok(verdict.whySentence.includes('2 circular dependencies'))
  assert.ok(verdict.whySentence.includes('2 orphan files'))
  assert.ok(verdict.whySentence.includes('2 unresolved imports'))
  assert.ok(verdict.whySentence.includes('10 unused dependencies'))

  const steps = getWhatToDoNext({
    diagnostics: viteDiag,
    deepScanData: viteDeepScan,
  })

  // The top 3 steps must include the 2 runtime cycles and the unresolved import
  const top3 = steps.slice(0, 3)
  assert.equal(top3.length, 3)
  assert.equal(top3[0].severity, 'Critical')
  assert.ok(top3[0].title.includes('packages/vite/src/node/packages.ts'))
  assert.equal(top3[1].severity, 'Critical')
  assert.ok(top3[1].title.includes('packages/vite/src/node/plugins/index.ts'))
  assert.equal(top3[2].severity, 'Important')
  assert.ok(top3[2].title.includes('Resolve missing import "../types.js" in packages/vite/src/node/index.ts'))
})

test('Skinveda-shaped response: is capped at B (1 cycle)', () => {
  const skinvedaDiag = [
    { status: 'warning', rule: 'node-engine' },
    { status: 'warning', rule: 'missing-license' },
    { status: 'warning', rule: 'missing-test-script' },
    { status: 'warning', rule: 'missing-ci-config' },
    { status: 'warning', rule: 'missing-nvmrc-or-engines' },
  ]
  const skinvedaDeepScan = {
    coverage: { graphFiles: 46 },
    summary: {
      cycles: [
        {
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          files: ['src/App.jsx', 'src/pages/Landing.jsx'],
          isTypeOnly: false,
        },
      ],
      usedButUndeclared: [],
      declaredButUnused: [],
      orphans: [],
      unresolvedImports: [],
    },
  }

  const verdict = getHealthVerdict({
    health: { score: 90 },
    diagnostics: skinvedaDiag,
    deepScanData: skinvedaDeepScan,
  })

  assert.equal(verdict.label, 'A few things to fix')
  assert.equal(verdict.grade, 'B')
  assert.equal(verdict.capReason, 'Capped at B by Reliability: 1 runtime cycle')
  assert.equal(verdict.gradeText, 'Capped at B by Reliability: 1 runtime cycle')
  assert.equal(verdict.showScore, true)
  assert.equal(verdict.score, 89)
  assert.ok(verdict.summaryLine.includes('critical'))
  assert.ok(!verdict.summaryLine.includes('5 setup warnings'))

  const steps = getWhatToDoNext({
    diagnostics: skinvedaDiag,
    deepScanData: skinvedaDeepScan,
  })

  assert.ok(steps.length > 0)
  assert.equal(steps[0].severity, 'Critical')
  assert.equal(steps[0].title, 'Break circular dependency: src/App.jsx → src/pages/Landing.jsx → src/App.jsx')
  assert.equal(steps[0].action?.value, 'src/App.jsx')
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


test('formatStackInPlainWords: Skinveda shape gives JavaScript (JSX) dominant language and backend stack sentence', () => {
  const skinvedaByLanguage = {
    jsx: 31,
    python: 15,
    javascript: 14,
    css: 7,
    svg: 4,
    json: 2,
    markdown: 1,
    html: 1,
    txt: 1,
    'config/other': 1,
    binary: 1,
  }
  const skinvedaProfile = {
    stacks: ['node', 'react', 'vite', 'python', 'fastapi'],
  }

  const sentence = formatStackInPlainWords({
    framework: null,
    stack: ['node', 'react', 'vite'],
    language: 'JavaScript',
    profile: skinvedaProfile,
    byLanguage: skinvedaByLanguage,
  })

  assert.equal(
    sentence,
    'A React app built with Vite, written in JavaScript (JSX), with a Python (FastAPI) backend'
  )
})

test('Phase 1: Verdict mapping (A=Looking healthy, B/C=A few things to fix, D/E=Needs attention)', () => {
  // Grade A
  const verdictA = getHealthVerdict({
    health: { score: 98, grade: 'A' },
    diagnostics: [],
    deepScanData: { grade: 'A', score: 98, summary: { cycles: [], usedButUndeclared: [] } },
  })
  assert.equal(verdictA.label, 'Looking healthy')
  assert.equal(verdictA.icon, '✓')
  assert.equal(verdictA.tone, 'healthy')

  // Grade B
  const verdictB = getHealthVerdict({
    health: { score: 85, grade: 'B' },
    diagnostics: [],
    deepScanData: { grade: 'B', score: 85, capReason: '1 runtime cycle', summary: { cycles: [{ isTypeOnly: false }], usedButUndeclared: [] } },
  })
  assert.equal(verdictB.label, 'A few things to fix')
  assert.equal(verdictB.icon, '⚠')
  assert.equal(verdictB.tone, 'warning')

  // Grade C
  const verdictC = getHealthVerdict({
    health: { score: 75, grade: 'C' },
    diagnostics: [],
    deepScanData: { grade: 'C', score: 75, capReason: '1 undeclared package', summary: { cycles: [], usedButUndeclared: ['foo'] } },
  })
  assert.equal(verdictC.label, 'A few things to fix')
  assert.equal(verdictC.icon, '⚠')
  assert.equal(verdictC.tone, 'warning')

  // Grade D
  const verdictD = getHealthVerdict({
    health: { score: 62, grade: 'D' },
    diagnostics: [{ status: 'error', rule: 'missing-build' }],
    deepScanData: { grade: 'D', score: 62, summary: { cycles: [], usedButUndeclared: [] } },
  })
  assert.equal(verdictD.label, 'Needs attention')
  assert.equal(verdictD.icon, '✖')
  assert.equal(verdictD.tone, 'attention')
})


test('Phase 2: generateProjectStory with Skinveda shape produces 3 concrete sentences', () => {
  const story = generateProjectStory({
    framework: null,
    stack: ['node', 'react', 'vite'],
    language: 'JavaScript',
    byLanguage: { jsx: 31, python: 15, javascript: 14 },
    profile: {
      stacks: ['node', 'react', 'vite', 'python', 'fastapi'],
      routes: Array.from({ length: 28 }, (_, i) => ({ method: 'GET', path: `/api/route${i}` })),
    },
    deepScanData: {
      coverage: { graphFiles: 46 },
      summary: {
        cycles: [
          {
            hub: {
              file: 'src/App.jsx',
              symbol: 'useApp',
              count: 26,
              suggestedFile: 'src/context/AppContext.jsx',
              totalFilesInCycle: 27,
            },
          },
        ],
      },
    },
    diagnostics: [],
  })

  // Sentence 1: stack and routes
  assert.ok(story.sentence1.includes('React app built with Vite, written in JavaScript (JSX), with a Python (FastAPI) backend'))
  assert.ok(story.sentence1.includes('exposing 28 API routes'))

  // Sentence 2: biggest structural risk
  assert.ok(story.sentence2.includes('26 pages import useApp from src/App.jsx; the loop runs through all 26 pages and App.jsx'))

  // Sentence 3: what to do first
  assert.ok(story.sentence3.includes('move useApp from src/App.jsx to src/context/AppContext.jsx'))
})

test('Phase 2: generateProjectStory with vite shape produces 3 concrete sentences', () => {
  const story = generateProjectStory({
    framework: 'Vite',
    stack: ['vite', 'TypeScript'],
    language: 'TypeScript',
    monorepo: true,
    byLanguage: { typescript: 1700, javascript: 81 },
    deepScanData: {
      coverage: { graphFiles: 1781 },
      summary: {
        entryPoints: Array.from({ length: 17 }, (_, i) => `packages/pkg_${i}/index.ts`),
        cycles: [
          {
            shortest: ['packages/vite/src/node/optimizer/scan.ts', 'packages/vite/src/node/plugins/esbuild.ts'],
          },
          {
            shortest: ['packages/vite/src/node/server/moduleGraph.ts', 'packages/vite/src/node/plugins/importAnalysis.ts'],
          },
        ],
      },
    },
    diagnostics: [],
  })

  assert.ok(story.sentence1.includes('TypeScript monorepo using Vite, with 17 library entry points'))
  assert.ok(story.sentence2.includes('2 runtime circular dependency loops between packages/vite/src/node/optimizer/scan.ts and packages/vite/src/node/plugins/esbuild.ts'))
  assert.ok(story.sentence3.includes('refactor packages/vite/src/node/optimizer/scan.ts to break the circular dependency loop with packages/vite/src/node/plugins/esbuild.ts'))
})

test('Phase 2: calculateRiskiestFiles ranks by formula and produces human-readable reasons', () => {
  const graph = {
    nodes: [
      {
        path: 'src/App.jsx',
        fanIn: 26,
        transitiveImpact: 26,
        size: 8000,
      },
      {
        path: 'src/pages/Landing.jsx',
        fanIn: 1,
        transitiveImpact: 1,
        size: 3000,
      },
      {
        path: 'src/utils/clean.js',
        fanIn: 0,
        transitiveImpact: 0,
        size: 500,
      },
    ],
    edges: [
      ['src/pages/Landing.jsx', 'src/App.jsx'],
    ],
  }

  const cycles = [
    {
      files: ['src/App.jsx', 'src/pages/Landing.jsx'],
      shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
    },
  ]

  const riskiest = calculateRiskiestFiles({
    graph,
    cycles,
    limit: 5,
  })

  assert.equal(riskiest.length, 3)
  assert.equal(riskiest[0].path, 'src/App.jsx')
  // App.jsx formula score check:
  // (26 * 3) + (26 * 2) + 25 (cycle) + 20 (no tests) + Math.min(15, Math.floor(8000 / 2048)) = 78 + 52 + 25 + 20 + 3 = 178
  assert.equal(riskiest[0].score, 178)
  assert.ok(riskiest[0].reason.includes('imported by 26 files'))
  assert.ok(riskiest[0].reason.includes('in a cycle'))
  assert.ok(riskiest[0].reason.includes('no tests'))
})
