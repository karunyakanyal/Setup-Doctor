import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let viteServer
let CodeMapPanel

test.before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const mod = await viteServer.ssrLoadModule(
    './src/components/codemap/CodeMapPanel.jsx',
  )
  CodeMapPanel = mod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

const sampleData = {
  coverage: {
    analyzedFiles: 12,
    totalFiles: 15,
    skipped: { binary: 2, ignored_directory: 1 },
    truncated: true,
    graphNodesOmitted: 42,
    approximate: true,
  },
  inventory: {
    byLanguage: { javascript: 10, json: 2 },
    byFolder: { src: 8, utils: 4 },
    largest: [
      { path: 'src/huge.js', size: 10500, lang: 'javascript' },
      { path: 'src/main.js', size: 4200, lang: 'javascript' },
    ],
    totalFiles: 15,
    analyzedFiles: 12,
  },
  graph: {
    nodes: [
      { id: 0, path: 'src/index.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 2, isEntry: true, isOrphan: false },
      { id: 1, path: 'src/utils.js', lang: 'javascript', size: 200, loc: 20, fanIn: 2, fanOut: 1, isEntry: false, isOrphan: false },
      { id: 2, path: 'src/api.js', lang: 'javascript', size: 150, loc: 15, fanIn: 1, fanOut: 1, isEntry: false, isOrphan: false },
      { id: 3, path: 'src/orphan.js', lang: 'javascript', size: 50, loc: 5, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: true },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 1],
    ],
    externals: [
      { name: 'react', count: 5, declared: true },
      { name: 'lodash', count: 2, declared: false },
    ],
  },
  summary: {
    entryPoints: ['src/index.js'],
    cycles: [['src/a.js', 'src/b.js']],
    orphans: ['src/orphan.js'],
    hotspots: {
      byFanIn: [{ path: 'src/utils.js', fanIn: 2 }],
      byTransitiveImpact: [{ path: 'src/utils.js', transitiveCount: 2, percent: 50.0 }],
    },
    declaredButUnused: ['chalk'],
    usedButUndeclared: ['lodash'],
    longestChain: 3,
    unresolvedCount: 1,
    parsedFiles: 4,
  },
}

test('CodeMapPanel: renders all sections when data is present', () => {
  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: sampleData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Header & status
  assert.ok(html.includes('Code Map'), 'Includes Code Map heading')
  assert.ok(html.includes('Scanned 12 of 15 files'), 'Includes inline scanned status')
  assert.ok(html.includes('Re-run deep scan'), 'Includes re-run button')

  // Summary cards
  assert.ok(html.includes('Files Analyzed'))
  assert.ok(html.includes('12'))
  assert.ok(html.includes('/ 15'))
  assert.ok(html.includes('Languages'))
  assert.ok(html.includes('Entry Points'))
  assert.ok(html.includes('Cycles'))
  assert.ok(html.includes('Orphans'))
  assert.ok(html.includes('Unresolved Imports'))

  // Approximate analysis notice
  assert.ok(html.includes('Approximate analysis'))
  assert.ok(html.includes('42 code files omitted'))

  // Section 1: Hotspots
  assert.ok(html.includes('Hotspots'))
  assert.ok(html.includes('Top Fan-In'))
  assert.ok(html.includes('Highest Impact Files'))
  assert.ok(html.includes('src/utils.js'))

  // Section 2: Circular Dependencies
  assert.ok(html.includes('Circular Dependencies (1)'))
  assert.ok(html.includes('src/a.js'))
  assert.ok(html.includes('src/b.js'))

  // Section 3: Orphan Files
  assert.ok(html.includes('Orphan Files (1)'))
  assert.ok(html.includes('src/orphan.js'))

  // Section 4: Dependencies
  assert.ok(html.includes('Dependencies'))
  assert.ok(html.includes('Declared but Unused (1)'))
  assert.ok(html.includes('chalk'))
  assert.ok(html.includes('Used but Undeclared (1)'))
  assert.ok(html.includes('lodash'))
  assert.ok(html.includes('react'))

  // Section 5: Inventory
  assert.ok(html.includes('Inventory'))
  assert.ok(html.includes('By Language'))
  assert.ok(html.includes('javascript'))
  assert.ok(html.includes('By Folder'))
  assert.ok(html.includes('Largest Files'))
  assert.ok(html.includes('src/huge.js'))

  // Section 6: File Explorer
  assert.ok(html.includes('File Explorer'))
  assert.ok(html.includes('Search analyzed files'))
  assert.ok(html.includes('id="codemap-file-search"'))
  assert.ok(html.includes('name="codemapFileSearch"'))
  assert.ok(html.includes('Changing this file affects'))

  // Neighborhood Graph SVG & Text list
  assert.ok(html.includes('File Neighborhood Graph'))
  assert.ok(html.includes('<svg'))
  assert.ok(html.includes('Imported by'))
  assert.ok(html.includes('Imports'))
})

test('CodeMapPanel: legacy state shows only re-run button when no scan data exists', () => {
  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: null,
      status: 'idle',
      onRerun: () => {},
    }),
  )

  assert.ok(html.includes('Code Map'))
  assert.ok(html.includes('Re-run deep scan'), 'Legacy analysis has Re-run deep scan button')
  assert.ok(html.includes('No deep scan available for this analysis'))

  // Does NOT render summary cards, file explorer, or SVG when no scan data exists
  assert.equal(html.includes('Files Analyzed'), false)
  assert.equal(html.includes('File Explorer'), false)
  assert.equal(html.includes('<svg'), false)
})

test('CodeMapPanel: error states display clear messages for 413, 429, 503, and network errors', () => {
  const error413 = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: null,
      status: 'error',
      error: 'Repository too large to scan fully',
      onRerun: () => {},
    }),
  )
  assert.ok(error413.includes('Repository too large to scan fully'))
  assert.ok(error413.includes('Re-run deep scan'))

  const error503 = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: null,
      status: 'error',
      error: 'Deep scan is busy, try again in a minute',
      onRerun: () => {},
    }),
  )
  assert.ok(error503.includes('Deep scan is busy, try again in a minute'))
  assert.ok(error503.includes('Re-run deep scan'))

  const error429 = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: null,
      status: 'error',
      error: 'Rate limit exceeded. Try again in 60s.',
      onRerun: () => {},
    }),
  )
  assert.ok(error429.includes('Rate limit exceeded. Try again in 60s.'))

  const errorNet = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: null,
      status: 'error',
      error: 'Network error while running deep scan',
      onRerun: () => {},
    }),
  )
  assert.ok(errorNet.includes('Network error while running deep scan'))
})

test('CodeMapPanel: scanning state shows inline Scanning all files and disables re-run button', () => {
  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: sampleData,
      status: 'scanning',
      onRerun: () => {},
    }),
  )

  assert.ok(html.includes('Scanning all files...'))
  assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Re-run button is disabled while scanning')
})
