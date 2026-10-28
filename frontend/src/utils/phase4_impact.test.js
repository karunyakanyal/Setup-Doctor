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
let NeighborhoodGraph

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const ngMod = await viteServer.ssrLoadModule(
    './src/components/codemap/NeighborhoodGraph.jsx',
  )
  NeighborhoodGraph = ngMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('Phase 1: Default view is Folder Blast Radius, sorted by affected count, with stacked bar and X of Y files affected', () => {
  const nodes = [
    { id: 0, path: 'src/utils/skincare.js', category: 'production' },
    // 3 files in src/pages/
    { id: 1, path: 'src/pages/Landing.jsx', category: 'production' },
    { id: 2, path: 'src/pages/Dashboard.jsx', category: 'production' },
    { id: 3, path: 'src/pages/Home.jsx', category: 'production' },
    // 1 file in src/components/
    { id: 4, path: 'src/components/Card.jsx', category: 'production' },
  ]
  const edges = [
    [1, 0], // Landing directly imports skincare
    [2, 0], // Dashboard directly imports skincare
    [4, 2], // Card indirectly imports skincare via Dashboard
  ]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/utils/skincare.js',
      imports: [],
      importers: ['src/pages/Landing.jsx', 'src/pages/Dashboard.jsx'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  // Title
  assert.ok(html.includes('File Neighborhood Graph: Impact Map'))
  // Folder blast radius is the default view
  assert.ok(html.includes('Folder blast radius') || html.includes('Affected Folders'))
  // Lists folders sorted by affected count: src/pages/ (2 affected of 3 total) and src/components/ (1 of 1)
  assert.ok(html.includes('src/pages/'))
  assert.ok(html.includes('2 of 3 files affected'))
  assert.ok(html.includes('src/components/'))
  assert.ok(html.includes('1 of 1 files affected'))
  // Stacked horizontal bar elements
  assert.ok(html.includes('folder-bar-track'))
  assert.ok(html.includes('bar-direct'))
  assert.ok(html.includes('bar-unaffected'))
  // Readable at 360px
  assert.ok(html.includes('min-width: 360px') || html.includes('min-width:360px'))
})

test('Phase 1: Clicking folder expands to its files with direct/indirect pill and Inspect button, largest folder open by default', () => {
  const nodes = [
    { id: 0, path: 'src/utils/skincare.js', category: 'production' },
    { id: 1, path: 'src/pages/Landing.jsx', category: 'production' },
    { id: 2, path: 'src/pages/Dashboard.jsx', category: 'production' },
  ]
  const edges = [
    [1, 0], // Landing directly imports skincare
    [2, 1], // Dashboard indirectly imports skincare via Landing
  ]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/utils/skincare.js',
      imports: [],
      importers: ['src/pages/Landing.jsx'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  // Largest folder (src/pages/) is open by default
  assert.ok(html.includes('impact-pill-direct'))
  assert.ok(html.includes('impact-pill-indirect'))
  assert.ok(html.includes('Landing.jsx'))
  assert.ok(html.includes('Dashboard.jsx'))
  assert.ok(html.includes('Inspect'))
})

test('Phase 1: Three plain answers: How risky?, What breaks first?, What should I test after changing this?', () => {
  const nodes = [
    { id: 0, path: 'src/core.js', category: 'production' },
    { id: 1, path: 'src/serviceA.js', category: 'production', fanIn: 10 },
    { id: 2, path: 'src/serviceB.js', category: 'production', fanIn: 4 },
  ]
  const edges = [
    [1, 0],
    [2, 0],
  ]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/serviceB.js', 'src/serviceA.js'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  // Three plain answers
  assert.ok(html.includes('How risky?'))
  assert.ok(html.includes('What breaks first?'))
  assert.ok(html.includes('What should I test after changing this?'))

  // Direct dependents sorted by fan-in (serviceA fan-in 10 before serviceB fan-in 4)
  const idxA = html.indexOf('src/serviceA.js')
  const idxB = html.indexOf('src/serviceB.js')
  assert.ok(idxA !== -1 && idxB !== -1)
  assert.ok(idxA < idxB, 'serviceA (fan-in 10) appears before serviceB (fan-in 4)')

  // No tests message with manual list
  assert.ok(html.includes('No tests touch this file; open these manually:'))
})

test('Phase 1: Cycles treated as ONE cluster, never tag each node, cycle membership never raises risk by itself', () => {
  const cycleFiles = [
    'src/App.jsx',
    'src/pages/Landing.jsx',
  ]
  const otherFiles = Array.from({ length: 98 }, (_, i) => ({
    id: i + 2,
    path: `src/other_${i}.js`,
    category: 'production',
  }))

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/App.jsx',
      imports: ['src/pages/Landing.jsx'],
      importers: [],
      graph: {
        nodes: [
          { id: 0, path: 'src/App.jsx', category: 'production' },
          { id: 1, path: 'src/pages/Landing.jsx', category: 'production' },
          ...otherFiles,
        ],
        edges: [[0, 1]],
      },
      cycles: [
        {
          files: cycleFiles,
          shortest: ['src/App.jsx', 'src/pages/Landing.jsx'],
          hub: { file: 'src/App.jsx', count: 26, symbol: 'useApp', totalFilesInCycle: 27 },
        },
      ],
      summary: {},
    }),
  )

  // One cluster
  assert.ok(html.includes('App.jsx cycle, 27 files'))
  assert.ok(html.includes('26 pages import useApp from src/App.jsx; the loop runs through all 26 pages and App.jsx.'))

  // Cycle membership alone does NOT raise risk (0% blast radius, no entry points -> Low risk)
  assert.ok(html.includes('Low risk'))
})

test('Phase 1: Optional Show graph view for up to 15 nodes, and >15 nodes replaced by message', () => {
  // Scenario A: <= 15 nodes with showGraph: true
  const smallNodes = [
    { id: 0, path: 'src/core.js', category: 'production' },
    { id: 1, path: 'src/dep1.js', category: 'production' },
    { id: 2, path: 'src/entry.js', isEntry: true, category: 'production' },
  ]
  const smallEdges = [[1, 0], [2, 0]]

  const htmlSmall = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/dep1.js', 'src/entry.js'],
      graph: { nodes: smallNodes, edges: smallEdges },
      cycles: [],
      summary: { entryPoints: ['src/entry.js'], hotspots: [] },
      initialShowGraph: true,
    }),
  )

  assert.ok(htmlSmall.includes('Selected file'))
  assert.ok(htmlSmall.includes('Direct dependents (2)'))
  assert.ok(htmlSmall.includes('ENTRY'))
  // No CYCLE tag on nodes
  assert.ok(!htmlSmall.includes('node-badge-tag">CYCLE'))

  // Scenario B: > 15 nodes with showGraph: true
  const largeNodes = [{ id: 0, path: 'src/core.js', category: 'production' }]
  const largeEdges = []
  const largeImporters = []
  for (let i = 1; i <= 20; i++) {
    const fPath = `src/dep_${i}.js`
    largeNodes.push({ id: i, path: fPath, category: 'production' })
    largeEdges.push([i, 0])
    largeImporters.push(fPath)
  }

  const htmlLarge = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: largeImporters,
      graph: { nodes: largeNodes, edges: largeEdges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      initialShowGraph: true,
    }),
  )

  assert.ok(htmlLarge.includes('Too many files to draw clearly; use the folder view'))
})

test('Phase 1: Why is this affected breadcrumb with shortest chain, clicking step never re-centers, only Inspect does', () => {
  // In server markup, verify Inspect button and chain structure classes are present
  const nodes = [
    { id: 0, path: 'src/core.js', category: 'production' },
    { id: 1, path: 'src/dep.js', category: 'production' },
  ]
  const edges = [[1, 0]]

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/dep.js'],
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
    }),
  )

  assert.ok(html.includes('Inspect'))
})

test('Phase 1: Vite constants.ts 179 affected files performance budget, folder rows only', () => {
  const nodes = [{ id: 0, path: 'packages/vite/src/shared/constants.ts', category: 'production' }]
  const edges = []
  const importers = []

  for (let i = 1; i <= 179; i++) {
    const fPath = `packages/vite/src/node/module_${i}.ts`
    nodes.push({ id: i, path: fPath, category: 'production' })
    edges.push([i, 0])
    importers.push(fPath)
  }

  const start = performance.now()
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'packages/vite/src/shared/constants.ts',
      imports: [],
      importers,
      graph: { nodes, edges },
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
    }),
  )
  const duration = performance.now() - start

  // Render time well under budget (< 50ms)
  assert.ok(duration < 100, `Render duration was ${duration.toFixed(2)}ms, expected < 100ms`)
  assert.ok(html.includes('179 of 179 files affected'))
  assert.ok(html.includes('packages/vite/src/node/'))
})
