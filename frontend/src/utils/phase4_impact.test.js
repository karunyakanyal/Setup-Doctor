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

test('Phase 4 Impact Map: Layout with Center node, Depends on (left), and Layers (right)', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/target.js', category: 'production' },
      { id: 1, path: 'src/direct.js', category: 'production' },
      { id: 2, path: 'src/secondary.js', category: 'production' },
      { id: 3, path: 'src/transitive.js', category: 'production' },
      { id: 4, path: 'src/imported.js', category: 'production' },
    ],
    edges: [
      [0, 4], // target imports imported.js
      [1, 0], // direct imports target
      [2, 1], // secondary imports direct
      [3, 2], // transitive imports secondary
    ],
  }

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/target.js',
      imports: ['src/imported.js'],
      importers: ['src/direct.js'],
      graph,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  // Title
  assert.ok(html.includes('File Neighborhood Graph: Impact Map'))
  // Layout columns
  assert.ok(html.includes('Depends on (1)'))
  assert.ok(html.includes('Selected File'))
  assert.ok(html.includes('Layer 1: Direct (1)'))
  assert.ok(html.includes('Layer 2: Secondary (1)'))
  assert.ok(html.includes('Layer 3+: Transitive (1)'))
  // SVG element present
  assert.ok(html.includes('<svg'))
  // Preserves accessible text list headings
  assert.ok(html.includes('Imported by'))
  assert.ok(html.includes('Imports'))
})

test('Phase 4 Impact Map: Node styling by file type and visual legend (text + color)', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/entry.js', isEntry: true, category: 'production' },
      { id: 2, path: 'src/hotspot.js', category: 'production' },
      { id: 3, path: 'vite.config.js', isConfig: true, category: 'production' },
      { id: 4, path: 'tests/core.test.js', isTest: true, category: 'non-production' },
      { id: 5, path: 'src/cycleA.js', category: 'production' },
    ],
    edges: [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ],
  }

  const cycles = [['src/cycleA.js', 'src/cycleB.js']]
  const summary = {
    entryPoints: ['src/entry.js'],
    hotspots: [{ file: 'src/hotspot.js' }],
  }

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/entry.js', 'src/hotspot.js', 'vite.config.js', 'tests/core.test.js', 'src/cycleA.js'],
      graph,
      cycles,
      summary,
      includeNonProd: true,
    }),
  )

  // Visual legend with text + color swatches
  assert.ok(html.includes('Visual legend'))
  assert.ok(html.includes('Entry point'))
  assert.ok(html.includes('Hotspot'))
  assert.ok(html.includes('In a cycle'))
  assert.ok(html.includes('Config'))
  assert.ok(html.includes('Test'))
  assert.ok(html.includes('Source'))

  // Node tags rendered (never color alone)
  assert.ok(html.includes('entry'))
  assert.ok(html.includes('hotspot'))
  assert.ok(html.includes('cycle'))
  assert.ok(html.includes('config'))
  assert.ok(html.includes('test'))
  assert.ok(html.includes('source'))
})

test('Phase 4 Impact Map: Plain-language summary and Risk badge calculation', () => {
  // Scenario 1: Low risk (<10%, no entry point, not in cycle)
  // 1 affected file out of 20 total files (5%)
  const nodesLow = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    path: `src/file${i}.js`,
    category: 'production',
  }))
  const graphLow = {
    nodes: nodesLow,
    edges: [[1, 0]], // file1 imports file0
  }

  const htmlLow = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/file0.js',
      imports: [],
      importers: ['src/file1.js'],
      graph: graphLow,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(htmlLow.includes('Low risk'))
  assert.ok(htmlLow.includes('Changing <strong>src/file0.js</strong> can affect <strong>1</strong> file (<strong>5%</strong> of repository): <strong>1</strong> directly, <strong>0</strong> indirectly.'))

  // Scenario 2: Medium risk (10-40%)
  // 3 affected files out of 10 total files (30%)
  const nodesMed = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    path: `src/file${i}.js`,
    category: 'production',
  }))
  const graphMed = {
    nodes: nodesMed,
    edges: [
      [1, 0],
      [2, 1],
      [3, 2],
    ],
  }

  const htmlMed = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/file0.js',
      imports: [],
      importers: ['src/file1.js'],
      graph: graphMed,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(htmlMed.includes('Medium risk'))
  assert.ok(htmlMed.includes('30%</strong> of repository'))

  // Scenario 3: High risk (>40% blast radius OR reaches entry point OR in cycle)
  const graphHigh = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/main.js', isEntry: true, category: 'production' },
    ],
    edges: [[1, 0]],
  }

  const htmlHigh = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/main.js'],
      graph: graphHigh,
      cycles: [],
      summary: { entryPoints: ['src/main.js'], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(htmlHigh.includes('High risk'))
  assert.ok(htmlHigh.includes('1 entry point affected'))
})

test('Phase 4 Impact Map: "Check these first" sorted by fan-in, with "Copy list" button', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/dep_high_fanin.js', category: 'production', fanIn: 15 },
      { id: 2, path: 'src/dep_low_fanin.js', category: 'production', fanIn: 2 },
    ],
    edges: [
      [1, 0],
      [2, 0],
    ],
  }

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/dep_low_fanin.js', 'src/dep_high_fanin.js'],
      graph,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(html.includes('Check these first (2)'))
  assert.ok(html.includes('Copy list'))
  assert.ok(html.includes('fan-in: 15'))
  assert.ok(html.includes('fan-in: 2'))

  // Verify dep_high_fanin appears before dep_low_fanin in the markup
  const idxHigh = html.indexOf('src/dep_high_fanin.js')
  const idxLow = html.indexOf('src/dep_low_fanin.js')
  assert.ok(idxHigh !== -1 && idxLow !== -1)
  assert.ok(idxHigh < idxLow, 'Higher fan-in file appears first in Check these first')
})

test('Phase 4 Impact Map: Test hint ("N tests cover this area" vs "No tests touch this file")', () => {
  // Area touched by tests
  const graphWithTests = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/service.js', category: 'production' },
      { id: 2, path: 'tests/core.test.js', isTest: true, category: 'non-production' },
    ],
    edges: [
      [1, 0],
      [2, 0], // core.test imports core
    ],
  }

  const htmlWithTests = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/service.js', 'tests/core.test.js'],
      graph: graphWithTests,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: true,
    }),
  )

  assert.ok(htmlWithTests.includes('1 test covers this area'))

  // Area with no tests
  const graphNoTests = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/service.js', category: 'production' },
    ],
    edges: [[1, 0]],
  }

  const htmlNoTests = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/service.js'],
      graph: graphNoTests,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(htmlNoTests.includes('No tests touch this file'))
})

test('Phase 4 Impact Map: Collapses >40 nodes into "+N more in <folder>"', () => {
  // Generate 50 nodes in Layer 1 inside folder 'src/modules'
  const nodes = [{ id: 0, path: 'src/base.js', category: 'production' }]
  const edges = []
  const importers = []

  for (let i = 1; i <= 50; i++) {
    const fPath = `src/modules/mod_${i}.js`
    nodes.push({ id: i, path: fPath, category: 'production' })
    edges.push([i, 0])
    importers.push(fPath)
  }

  const graph = { nodes, edges }

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/base.js',
      imports: [],
      importers,
      graph,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  // 50 > 40 -> 35 visible, 15 collapsed in src/modules
  assert.ok(html.includes('+15 more in src/modules'))
})

test('Phase 4 Impact Map: Accessibility (tooltips, tabIndex, min-width 360px)', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/app.js', category: 'production' },
    ],
    edges: [[1, 0]],
  }

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'src/core.js',
      imports: [],
      importers: ['src/app.js'],
      graph,
      cycles: [],
      summary: { entryPoints: [], hotspots: [] },
      includeNonProd: false,
    }),
  )

  assert.ok(html.includes('min-width: 360px') || html.includes('min-width:360px'))
  assert.ok(html.includes('title="src/core.js"') || html.includes('<title>src/core.js</title>'))
  assert.ok(html.includes('aria-label="Select src/app.js"'))
})
