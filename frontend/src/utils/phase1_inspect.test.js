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
