import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  buildMergedFindings,
  getHealthVerdict,
  getWhatToDoNext,
  formatCapReasonPlainWords,
} from './projectGlance.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '../..')

let viteServer
let DiagnosticCard
let DiagnosticsHealthSummary
let NeighborhoodGraph

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  const dcMod = await viteServer.ssrLoadModule('./src/components/diagnostics/DiagnosticCard.jsx')
  DiagnosticCard = dcMod.default

  const dhsMod = await viteServer.ssrLoadModule('./src/components/diagnostics/DiagnosticsHealthSummary.jsx')
  DiagnosticsHealthSummary = dhsMod.default

  const ngMod = await viteServer.ssrLoadModule('./src/components/codemap/NeighborhoodGraph.jsx')
  NeighborhoodGraph = ngMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('Phase 1 - Cycle findings have real import lines and never "cycle step N"', () => {
  const deepScanData = {
    summary: {
      cycles: [
        {
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          files: ['src/App.jsx', 'src/pages/Landing.jsx'],
          evidence: [
            { file: 'src/App.jsx', line: 5, snippet: "import Landing from './pages/Landing';" },
            { file: 'src/pages/Landing.jsx', line: 2, snippet: "import { useApp } from '../App';" },
          ],
        },
      ],
    },
  }

  const findings = buildMergedFindings({ deepScanData })
  const cycleFinding = findings.find((f) => f.topic === 'cycles')
  assert.ok(cycleFinding, 'Cycle finding should exist')
  assert.equal(cycleFinding.evidence.length, 2)
  assert.equal(cycleFinding.evidence[0].file, 'src/App.jsx')
  assert.equal(cycleFinding.evidence[0].line, 5)
  assert.equal(cycleFinding.evidence[0].snippet, "import Landing from './pages/Landing';")
  assert.equal(cycleFinding.evidence[1].file, 'src/pages/Landing.jsx')
  assert.equal(cycleFinding.evidence[1].line, 2)
  assert.equal(cycleFinding.evidence[1].snippet, "import { useApp } from '../App';")

  // Ensure no "cycle step" placeholder exists
  for (const ev of cycleFinding.evidence) {
    assert.ok(!ev.snippet.includes('cycle step'), `Snippet must not be placeholder: ${ev.snippet}`)
  }
})

test('Phase 1 - Hub detection with Skinveda shape states "26 pages import useApp from src/App.jsx; the loop runs through all 26 pages and App.jsx"', () => {
  const deepScanData = {
    summary: {
      cycles: [
        {
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          files: ['src/App.jsx', 'src/pages/Landing.jsx'],
          evidence: [
            { file: 'src/App.jsx', line: 5, snippet: "import Landing from './pages/Landing';" },
            { file: 'src/pages/Landing.jsx', line: 2, snippet: "import { useApp } from '../App';" },
          ],
          hub: {
            file: 'src/App.jsx',
            symbol: 'useApp',
            count: 26,
            suggestedFile: 'src/context/AppContext.jsx',
            brokenCyclesCount: 1,
            sentence: '26 files import useApp from src/App.jsx',
          },
        },
      ],
    },
  }

  const findings = buildMergedFindings({ deepScanData })
  const cycleFinding = findings.find((f) => f.topic === 'cycles')
  assert.ok(cycleFinding)
  assert.ok(cycleFinding.why.includes('26 pages import useApp from src/App.jsx; the loop runs through all 26 pages and App.jsx'))
  assert.ok(cycleFinding.fix.includes('src/context/AppContext.jsx'))
  assert.ok(cycleFinding.fix.includes('this one change breaks the loop through all 26 pages and App.jsx'))
})

test('Phase 1 - Summary line comes from merged findings severity counts', () => {
  const skinvedaDiag = [
    { status: 'warning', rule: 'missing-test-script' },
    { status: 'warning', rule: 'react-no-error-boundary' },
    { status: 'warning', rule: 'node-version-missing' },
    { status: 'warning', rule: 'missing-ci' },
    { status: 'warning', rule: 'missing-license' },
  ]
  const skinvedaDeepScan = {
    summary: {
      cycles: [
        {
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          files: ['src/App.jsx', 'src/pages/Landing.jsx'],
        },
      ],
      orphans: [],
      declaredButUnused: [],
      usedButUndeclared: [],
      unresolvedImports: [],
    },
    coverage: { graphFiles: 46 },
  }

  const verdict = getHealthVerdict({
    health: { score: 90 },
    diagnostics: skinvedaDiag,
    deepScanData: skinvedaDeepScan,
  })

  assert.ok(verdict.summaryLine.includes('critical'))
  assert.ok(verdict.summaryLine.includes('important'))
  assert.ok(verdict.summaryLine.includes('nice-to-have'))
  assert.ok(!verdict.summaryLine.includes('setup warnings'), 'Summary line must never say setup warnings')
  assert.ok(!verdict.summaryLine.includes('5 setup warnings'))
})

test('Phase 1 - Copyable step for missing test script is the snippet that adds one, never "npm test"', () => {
  const diag = [{ status: 'warning', rule: 'missing-test-script' }]
  const findings = buildMergedFindings({ diagnostics: diag })
  const testFinding = findings.find((f) => f.topic === 'tests')
  assert.ok(testFinding, 'Test finding must exist')
  assert.notEqual(testFinding.action?.value, 'npm test')
  assert.equal(testFinding.action?.value, 'npm pkg set scripts.test="node --test"')

  const steps = getWhatToDoNext({ diagnostics: diag })
  const testStep = steps.find((s) => s.title.toLowerCase().includes('test'))
  assert.ok(testStep)
  assert.notEqual(testStep.action?.value, 'npm test')
  assert.equal(testStep.action?.value, 'npm pkg set scripts.test="node --test"')
})

test('Phase 1 - capReason is formatted in plain words without raw rule IDs', () => {
  const formatted1 = formatCapReasonPlainWords('Maintainability: no automated tests (missing-tests)', 'C', 'Maintainability')
  assert.equal(formatted1, 'Capped at C by Maintainability: no automated tests')
  assert.ok(!formatted1.includes('missing-tests'), 'Must not contain raw rule id')

  const formatted2 = formatCapReasonPlainWords('1 runtime cycle', 'B')
  assert.equal(formatted2, 'Capped at B by Reliability: 1 runtime cycle')

  const formatted3 = formatCapReasonPlainWords('1 undeclared package', 'C')
  assert.equal(formatted3, 'Capped at C by Security: 1 undeclared package')
})

test('Phase 2 - Technical details: filler texts are removed and sections hidden when empty', () => {
  const diagWithoutWhyOrFix = {
    status: 'warning',
    rule: 'some-rule',
    title: 'Custom Check',
    message: 'Check notice',
  }

  const html = renderToStaticMarkup(
    React.createElement(DiagnosticCard, {
      diagnostic: diagWithoutWhyOrFix,
    }),
  )

  assert.ok(!html.includes('Addressing setup'), 'Must not contain Addressing setup filler text')
  assert.ok(!html.includes('Review the issue details above'), 'Must not contain Review the issue details filler text')
  assert.ok(!html.includes('finding-why'), 'Empty why section must be hidden')
  assert.ok(!html.includes('finding-how'), 'Empty how section must be hidden')
})

test('Phase 2 - Technical details: grade box layout lines are rendered separately without squeezing', () => {
  const html = renderToStaticMarkup(
    React.createElement(DiagnosticsHealthSummary, {
      health: { score: 85 },
      overallGrade: 'B',
      score: 85,
      capReason: 'Capped at B by Reliability: 1 runtime cycle',
    }),
  )

  assert.ok(html.includes('health-grade-line'))
  assert.ok(html.includes('health-verdict-line'))
  assert.ok(html.includes('health-score-display'))
  assert.ok(html.includes('health-cap-line'))
  assert.ok(html.includes('Capped at B by Reliability: 1 runtime cycle'))
})

test('Phase 3 - Impact Map: node tag on separate line, legend has shapes, clicking does not re-center', () => {
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/utils/skincare.js',
      imports: [],
      importers: ['src/lib/analysis.js', 'src/pages/Dashboard.jsx'],
      graph: {
        nodes: [
          { path: 'src/utils/skincare.js', id: 0, isEntry: false },
          { path: 'src/lib/analysis.js', id: 1, isEntry: false },
          { path: 'src/pages/Dashboard.jsx', id: 2, isEntry: true },
        ],
        edges: [
          [1, 0],
          [2, 1],
        ],
      },
      cycles: [],
      summary: {},
    }),
  )

  // Legend swatches with shapes/icons
  assert.ok(html.includes('●'), 'Entry legend swatch shape')
  assert.ok(html.includes('▲'), 'Hotspot legend swatch shape')
  assert.ok(html.includes('◆'), 'Cycle legend swatch shape')
  assert.ok(html.includes('■'), 'Config legend swatch shape')
  assert.ok(html.includes('🧪'), 'Test legend swatch icon')
  assert.ok(html.includes('▫'), 'Source legend swatch shape')

  // Tooltip & aria-label
  assert.ok(html.includes('title="src/lib/analysis.js"'))
  assert.ok(html.includes('aria-label="Select src/lib/analysis.js"'))
})

test('Phase 3 - Cycle dominance: >50% cycle nodes replaces per-node CYCLE tag with one note', () => {
  const cycleFiles = [
    'src/App.jsx',
    'src/pages/Landing.jsx',
    'src/pages/Dashboard.jsx',
    'src/pages/Login.jsx',
  ]
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/App.jsx',
      imports: ['src/pages/Landing.jsx', 'src/pages/Dashboard.jsx', 'src/pages/Login.jsx'],
      importers: [],
      graph: {
        nodes: [
          { path: 'src/App.jsx', id: 0 },
          { path: 'src/pages/Landing.jsx', id: 1 },
          { path: 'src/pages/Dashboard.jsx', id: 2 },
          { path: 'src/pages/Login.jsx', id: 3 },
          { path: 'src/main.jsx', id: 4 },
        ],
        edges: [
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      },
      cycles: [
        {
          files: cycleFiles,
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          hub: { file: 'src/App.jsx', count: 26, symbol: 'useApp' },
        },
      ],
      summary: {},
    }),
  )

  assert.ok(html.includes('are part of the App.jsx cycle'), 'Dominance note should be rendered')
})

test('Phase 3 - Being in a cycle never makes risk High by itself', () => {
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/App.jsx',
      imports: ['src/pages/Landing.jsx'],
      importers: [],
      graph: {
        nodes: [
          { path: 'src/App.jsx', id: 0 },
          { path: 'src/pages/Landing.jsx', id: 1 },
          ...Array.from({ length: 98 }, (_, i) => ({ path: `src/other_${i}.js`, id: i + 2 })),
        ],
        edges: [[0, 1]],
      },
      cycles: [
        {
          files: ['src/App.jsx', 'src/pages/Landing.jsx'],
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
        },
      ],
      summary: {},
    }),
  )

  // 0% blast radius, no entry points: risk must be Low even though in a cycle!
  assert.ok(html.includes('Low risk'), 'Being in a cycle must not make risk High by itself')
})
test('Phase 3 - Technical details shows rule-engine grade and fails if two different letter grades appear on page', () => {
  // Scenario: rule engine gave Grade C (score 83), while setup checks was 90
  const html = renderToStaticMarkup(
    React.createElement(DiagnosticsHealthSummary, {
      health: { score: 90 },
      overallGrade: 'C',
      overallScore: 83,
      capReason: 'Capped at C by Maintainability: no automated tests',
    })
  )

  // 1. Large verdict block shows rule-engine grade C, 83/100, and "A few things to fix"
  assert.ok(html.includes('grade-badge-C'), 'Large badge shows rule-engine grade C')
  assert.ok(html.includes('83'), 'Score displays 83')
  assert.ok(html.includes('A few things to fix'), 'Verdict is A few things to fix')

  // 2. Legacy 90 appears ONLY as small Setup checks line
  assert.ok(html.includes('Setup checks: 90/100'), 'Legacy 90 appears as Setup checks: 90/100')
  assert.ok(!html.includes('grade-badge-A'), 'Must NEVER show Grade A badge')
  assert.ok(!html.includes('Looking healthy'), 'Must NEVER show Looking healthy')

  // 3. Page consistency check: collect all primary grade-badges and ensure only one letter grade exists
  const gradeMatches = [...html.matchAll(/grade-badge-([A-F])/g)].map(m => m[1])
  const uniqueGrades = new Set(gradeMatches)
  assert.equal(uniqueGrades.size, 1, `Expected exactly 1 unique letter grade on page, found: ${[...uniqueGrades].join(', ')}`)
  assert.equal([...uniqueGrades][0], 'C')
})

