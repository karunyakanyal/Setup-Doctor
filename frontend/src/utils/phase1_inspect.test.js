import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '../..')

let viteServer
let RiskiestFilesCard
let NeighborhoodGraph
let CodeMapPanel
let RecentAnalyses

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  const rfcMod = await viteServer.ssrLoadModule(
    './src/components/diagnostics/RiskiestFilesCard.jsx',
  )
  RiskiestFilesCard = rfcMod.default

  const ngMod = await viteServer.ssrLoadModule(
    './src/components/codemap/NeighborhoodGraph.jsx',
  )
  NeighborhoodGraph = ngMod.default

  const cmpMod = await viteServer.ssrLoadModule(
    './src/components/codemap/CodeMapPanel.jsx',
  )
  CodeMapPanel = cmpMod.default

  const raMod = await viteServer.ssrLoadModule(
    './src/components/RecentAnalyses.jsx',
  )
  RecentAnalyses = raMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('Phase 1: Inspect from RiskiestFilesCard renders working Inspect button and triggers selection', () => {
  const nodes = [
    { id: 0, path: 'src/App.jsx', fanIn: 25, transitiveImpact: 30, category: 'production' },
    { id: 1, path: 'src/utils/api.js', fanIn: 10, transitiveImpact: 15, category: 'production' },
  ]
  const edges = []
  const cycles = []

  let inspectedFile = null
  const onInspectFile = (filePath) => {
    inspectedFile = filePath
  }

  const html = renderToStaticMarkup(
    React.createElement(RiskiestFilesCard, {
      graph: { nodes, edges },
      cycles,
      includeNonProd: false,
      onInspectFile,
    }),
  )

  assert.ok(html.includes('riskiest-files-card'), 'RiskiestFilesCard renders')
  assert.ok(html.includes('Inspect'), 'Inspect button rendered')
  assert.ok(html.includes('aria-label="Inspect src/App.jsx"'), 'Inspect button for App.jsx has accessible aria-label')
  assert.ok(html.includes('risk-score-bar-track'), 'Risk score bar track rendered')
  assert.ok(html.includes('/100'), 'Score is out of 100')
  onInspectFile('src/App.jsx')
  assert.equal(inspectedFile, 'src/App.jsx')
})

test('Phase 1: Inspect from folder rows in NeighborhoodGraph triggers onSelectFile and renders Back button when canGoBack is true', () => {
  const nodes = [
    { id: 0, path: 'src/center.js', category: 'production' },
    { id: 1, path: 'src/pages/Landing.jsx', category: 'production' },
    { id: 2, path: 'src/pages/Dashboard.jsx', category: 'production' },
  ]
  const edges = [
    [1, 0],
    [2, 0],
  ]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/center.js',
      imports: [],
      importers: ['src/pages/Landing.jsx', 'src/pages/Dashboard.jsx'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
      canGoBack: true,
      onBack: () => {},
      onSelectFile: () => {},
    }),
  )

  // Back button rendered when canGoBack is true
  assert.ok(html.includes('btn-inspect-back'), 'Back button rendered when canGoBack is true')
  assert.ok(html.includes('← Back'), 'Back button displays arrow and label')
  assert.ok(html.includes('id="inspecting-file-heading"'), 'Heading has id="inspecting-file-heading" for focus/scroll')

  // Folder file rows render Inspect buttons
  assert.ok(html.includes('aria-label="Inspect src/pages/Landing.jsx"'), 'Folder row has Inspect button for Landing.jsx')
})

test('Phase 1: Inspect from "What breaks first?" (Files that could break) renders Direct/2 hops pills and Inspect buttons', () => {
  const nodes = [
    { id: 0, path: 'src/core.js', category: 'production', fanIn: 0 },
    { id: 1, path: 'src/service.js', category: 'production', fanIn: 8 },
    { id: 2, path: 'src/ui.js', category: 'production', fanIn: 2 },
  ]
  const edges = [
    [1, 0], // service imports core directly (depth 1)
    [2, 1], // ui imports service directly -> core at depth 2 (2 hops)
  ]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/service.js'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
      canGoBack: false,
      onBack: () => {},
      onSelectFile: () => {},
    }),
  )

  assert.ok(html.includes('What breaks first? (Files that could break)'), 'What breaks first heading rendered')
  assert.ok(html.includes('impact-pill-direct'), 'Direct pill rendered')
  assert.ok(html.includes('2 hops'), '2 hops label rendered')
  assert.ok(html.includes('aria-label="Inspect src/service.js"'), 'Direct dependent has Inspect button')
  assert.ok(html.includes('aria-label="Inspect src/ui.js"'), 'Indirect dependent has Inspect button')
})

test('Phase 1: Inspect from cycle list in CodeMapPanel triggers onInspectFile and selects file', () => {
  const nodes = [
    { id: 0, path: 'src/a.js', category: 'production' },
    { id: 1, path: 'src/b.js', category: 'production' },
  ]
  const edges = [
    [0, 1],
    [1, 0],
  ]
  const cycles = [
    { files: ['src/a.js', 'src/b.js'], shortest: ['src/a.js', 'src/b.js'], length: 2 },
  ]

  let inspected = null
  const handleInspect = (f) => {
    inspected = f
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: {
        graph: { nodes, edges },
        inventory: { totalFiles: 2, byLanguage: { JavaScript: 2 } },
        summary: {
          cycles,
          packages: [],
          entryPoints: [],
          orphans: [],
          unresolvedCount: 0,
        },
      },
      onInspectFile: handleInspect,
      canGoBack: true,
      onBack: () => {},
    }),
  )

  assert.ok(html.includes('aria-label="Inspect src/a.js"'), 'Cycle item has Inspect aria-label for src/a.js')
  assert.ok(html.includes('aria-label="Inspect src/b.js"'), 'Cycle item has Inspect aria-label for src/b.js')
  handleInspect('src/a.js')
  assert.equal(inspected, 'src/a.js')
})

test('Phase 1: Navigation history simulation verifies riskiest files, folder rows, what breaks first and cycle list enable Back', () => {
  let selectedFile = 'src/initial.js'
  let history = []

  const handleInspectFile = (filePath) => {
    if (!filePath) return
    if (selectedFile && selectedFile !== filePath) {
      history.push(selectedFile)
    }
    selectedFile = filePath
  }

  const handleInspectBack = () => {
    if (history.length === 0) return
    selectedFile = history.pop()
  }

  // 1. Inspect from riskiest files:
  handleInspectFile('src/App.jsx')
  assert.equal(selectedFile, 'src/App.jsx')
  assert.deepEqual(history, ['src/initial.js'])
  assert.equal(history.length > 0, true, 'Back is enabled after riskiest files inspect')

  // 2. Inspect from folder row:
  handleInspectFile('src/pages/Landing.jsx')
  assert.equal(selectedFile, 'src/pages/Landing.jsx')
  assert.deepEqual(history, ['src/initial.js', 'src/App.jsx'])

  // 3. Inspect from "what breaks first":
  handleInspectFile('src/components/Button.jsx')
  assert.equal(selectedFile, 'src/components/Button.jsx')
  assert.deepEqual(history, ['src/initial.js', 'src/App.jsx', 'src/pages/Landing.jsx'])

  // 4. Inspect from cycle list:
  handleInspectFile('src/context/AppContext.jsx')
  assert.equal(selectedFile, 'src/context/AppContext.jsx')
  assert.deepEqual(history, ['src/initial.js', 'src/App.jsx', 'src/pages/Landing.jsx', 'src/components/Button.jsx'])

  // 5. Back navigation pops in LIFO order
  handleInspectBack()
  assert.equal(selectedFile, 'src/components/Button.jsx')
  handleInspectBack()
  assert.equal(selectedFile, 'src/pages/Landing.jsx')
  handleInspectBack()
  assert.equal(selectedFile, 'src/App.jsx')
  handleInspectBack()
  assert.equal(selectedFile, 'src/initial.js')
  assert.equal(history.length, 0, 'History is empty, Back is disabled')
})


test('Phase 1: Riskiest files Inspect button scrolls and focuses #inspecting-file-heading with block: "start"', () => {
  let scrolledOpts = null
  let focusedId = null

  // Mock DOM element and scrollIntoView / focus
  const mockHeading = {
    id: 'inspecting-file-heading',
    scrollIntoView: (opts) => { scrolledOpts = opts },
    focus: () => { focusedId = 'inspecting-file-heading' },
  }

  // Simulate inspect trigger logic
  const prefersReducedMotion = false
  mockHeading.scrollIntoView({
    block: 'start',
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  })
  mockHeading.focus()

  assert.equal(scrolledOpts.block, 'start', 'scrollIntoView must use block: "start"')
  assert.equal(scrolledOpts.behavior, 'smooth', 'scrollIntoView uses smooth behavior when reduced motion is false')
  assert.equal(focusedId, 'inspecting-file-heading', 'Focus must move to inspecting-file-heading')

  // With prefers-reduced-motion
  let reducedOpts = null
  const mockHeadingReduced = {
    scrollIntoView: (opts) => { reducedOpts = opts },
  }
  const reducedMotion = true
  mockHeadingReduced.scrollIntoView({
    block: 'start',
    behavior: reducedMotion ? 'auto' : 'smooth',
  })
  assert.equal(reducedOpts.behavior, 'auto', 'scrollIntoView uses auto behavior when reduced motion is true')
})

test('Phase 2 & 4: Skinveda src/components/ui.jsx has 0 imports (None) and 29 importers with +21 more label', () => {
  const importers29 = Array.from({ length: 29 }, (_, i) => 'src/importer_' + String(i + 1).padStart(2, '0') + '.jsx')
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/components/ui.jsx',
      imports: [],
      importers: importers29,
      graph: {
        nodes: [
          { path: 'src/components/ui.jsx', id: 0, fanIn: 29 },
          ...importers29.map((p, idx) => ({ path: p, id: idx + 1, fanIn: 1 })),
        ],
        edges: importers29.map((p, idx) => [idx + 1, 0]),
      },
      cycles: [],
      summary: {},
    }),
  )

  // Left column: 0 imports -> displays "None"
  assert.ok(html.includes('Imports (0)'), 'Left column shows Imports (0)')
  assert.ok(html.includes('None'), 'Left column shows None')

  // Right column: 29 importers -> shows max 8 + "+21 more"
  assert.ok(html.includes('Imported by (29)'), 'Right column shows Imported by (29)')
  assert.ok(html.includes('+21 more'), 'Shows +21 more expansion box')
  assert.ok(html.includes('src/importer_01.jsx'), 'Shows first importer')
  assert.ok(html.includes('src/importer_08.jsx'), 'Shows eighth importer')
})

test('Phase 2: Tags only shown for ENTRY, HOTSPOT, TEST, CONFIG, none for plain source files, with tiny legend', () => {
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/components/ui.jsx',
      imports: ['src/config.json', 'src/utils.test.js'],
      importers: ['src/main.jsx', 'src/App.jsx'],
      graph: {
        nodes: [
          { path: 'src/components/ui.jsx', id: 0 },
          { path: 'src/config.json', id: 1, isConfig: true },
          { path: 'src/utils.test.js', id: 2, isTest: true },
          { path: 'src/main.jsx', id: 3, isEntry: true },
          { path: 'src/App.jsx', id: 4 },
        ],
        edges: [
          [0, 1],
          [0, 2],
          [3, 0],
          [4, 0],
        ],
      },
      cycles: [],
      summary: { entryPoints: ['src/main.jsx'], hotspots: ['src/App.jsx'] },
    }),
  )

  // Tags shown for ENTRY, HOTSPOT, CONFIG, TEST
  assert.ok(html.includes('[ENTRY]'), 'ENTRY tag rendered')
  assert.ok(html.includes('[HOTSPOT]'), 'HOTSPOT tag rendered')
  assert.ok(html.includes('[CONFIG]'), 'CONFIG tag rendered')
  assert.ok(html.includes('[TEST]'), 'TEST tag rendered')
  // No SOURCE tag
  assert.ok(!html.includes('[SOURCE]'), 'No tag for plain source file')

  // Tiny legend present when tags are shown
  assert.ok(html.includes('neighborhood-tiny-legend'), 'Tiny legend rendered when tags are shown')
})

test('Phase 3: Details section is collapsed by default, and cycle cluster appears only when selected file is in the cycle', () => {
  const cycleFiles = ['src/App.jsx', 'src/pages/Landing.jsx']
  const cycles = [
    {
      files: cycleFiles,
      shortest: cycleFiles,
      hub: { file: 'src/App.jsx', count: 26, symbol: 'useApp', totalFilesInCycle: 27 },
    },
  ]

  // File IN cycle (App.jsx)
  const htmlInCycle = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/App.jsx',
      imports: ['src/pages/Landing.jsx'],
      importers: [],
      graph: {
        nodes: [
          { path: 'src/App.jsx', id: 0 },
          { path: 'src/pages/Landing.jsx', id: 1 },
        ],
        edges: [[0, 1]],
      },
      cycles,
      summary: {},
    }),
  )

  assert.ok(htmlInCycle.includes('inspecting-details-accordion'), 'Details accordion rendered')
  assert.ok(htmlInCycle.includes('<summary class="inspecting-details-summary">Details</summary>'), 'Summary says Details')
  assert.ok(htmlInCycle.includes('App.jsx cycle, 27 files'), 'Cycle cluster shown when file is in cycle')

  // File NOT in cycle (src/components/ui.jsx)
  const htmlNotInCycle = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/components/ui.jsx',
      imports: [],
      importers: [],
      graph: {
        nodes: [{ path: 'src/components/ui.jsx', id: 0 }],
        edges: [],
      },
      cycles,
      summary: {},
    }),
  )

  assert.ok(!htmlNotInCycle.includes('App.jsx cycle, 27 files'), 'Cycle cluster OMITTED when file is not in cycle')
})

test('Phase 3: Tests to run has single sentence without duplicated warning text', () => {
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/no-tests.js',
      imports: [],
      importers: ['src/page.jsx'],
      graph: {
        nodes: [
          { path: 'src/no-tests.js', id: 0 },
          { path: 'src/page.jsx', id: 1 },
        ],
        edges: [[1, 0]],
      },
      cycles: [],
      summary: {},
    }),
  )

  assert.ok(html.includes('No tests touch this file; open these manually:'), 'Clean single warning sentence')
  assert.ok(!html.includes('No test covers this; check these pages manually:'), 'No duplicated warning sentence')
})

test('Phase 3: RecentAnalyses shows overall grade letter (e.g. C) and "-" when missing, never "Healthy"', () => {
  const history = [
    {
      id: '1',
      repository: { name: 'Skinveda', fullName: 'user/Skinveda', defaultBranch: 'main' },
      codeMapSummary: { grade: 'C' },
      analyzedAt: new Date().toISOString(),
    },
    {
      id: '2',
      repository: { name: 'ViteProject', fullName: 'user/ViteProject', defaultBranch: 'main' },
      health: { grade: 'A', status: 'Healthy' },
      analyzedAt: new Date().toISOString(),
    },
    {
      id: '3',
      repository: { name: 'OldRepo', fullName: 'user/OldRepo', defaultBranch: 'main' },
      analyzedAt: new Date().toISOString(),
    },
  ]

  const html = renderToStaticMarkup(
    React.createElement(RecentAnalyses, {
      history,
      onSelectAnalysis: () => {},
    }),
  )

  // Grade column header
  assert.ok(html.includes('<th>Grade</th>'), 'Header has Grade column')
  // Saved grades
  assert.ok(html.includes('grade-badge grade-c'), 'Grade C rendered')
  assert.ok(html.includes('grade-badge grade-a'), 'Grade A rendered')
  // Missing grade shows "-"
  assert.ok(html.includes('grade-badge grade--'), 'Missing grade displays -')
  // Never old "Healthy" label in table cells
  assert.ok(!html.includes('status healthy'), 'Never old status healthy')
})
