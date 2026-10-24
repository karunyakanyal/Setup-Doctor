import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getImpact } from './graphImpact.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '../..')

let viteServer
let CodeMapPanel
let NeighborhoodGraph

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const mod = await viteServer.ssrLoadModule(
    './src/components/codemap/CodeMapPanel.jsx',
  )
  CodeMapPanel = mod.default

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
  assert.ok(
    html.includes('4 code files mapped, 8 other files inventoried, 3 skipped'),
    'Includes inline mapped connections status',
  )
  assert.ok(html.includes('Re-run deep scan'), 'Includes re-run button')

  // Summary cards
  assert.ok(html.includes('Code Files Mapped'))
  assert.ok(html.includes('4'))
  assert.ok(html.includes('Other Files Inventoried'))
  assert.ok(html.includes('8'))
  assert.ok(html.includes('3 skipped'))
  assert.equal(html.includes('Files Analyzed'), false)
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
  assert.ok(html.includes('compact-stat-row'))

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
  assert.equal(html.includes('Code Files Mapped'), false)
  assert.equal(html.includes('Other Files Inventoried'), false)
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

test('CodeMapPanel: displays mapped connections and lists unsupported languages (e.g. Python: 15 files, not mapped)', () => {
  const customData = {
    coverage: {
      graphFiles: 25,
      totalFiles: 40,
      graphLanguages: { javascript: 25 },
      inventoryOnlyLanguages: { python: 15 },
    },
    inventory: {
      byLanguage: { javascript: 25, python: 15 },
      totalFiles: 40,
      analyzedFiles: 40,
    },
    graph: {
      nodes: [
        { id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false },
      ],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
      declaredButUnused: [],
      usedButUndeclared: [],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: customData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Header status & approximate banner
  assert.ok(html.includes('25 code files mapped, 15 other files inventoried, 0 skipped'))
  assert.ok(html.includes('Python: 15 files, not mapped'))
})

test('CodeMapPanel: cycle rows show short loop with arrows, hint, and expandable list', () => {
  const cycleData = {
    coverage: { totalFiles: 3, graphFiles: 3 },
    inventory: { totalFiles: 3, analyzedFiles: 3 },
    graph: {
      nodes: [
        { id: 0, path: 'src/App.jsx', lang: 'javascript', size: 100, loc: 10, fanIn: 1, fanOut: 1, isEntry: true, isOrphan: false },
        { id: 1, path: 'src/Header.jsx', lang: 'javascript', size: 100, loc: 10, fanIn: 1, fanOut: 1, isEntry: false, isOrphan: false },
        { id: 2, path: 'src/extra.jsx', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: false },
      ],
      edges: [[0, 1], [1, 0]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/App.jsx'],
      cycles: [
        {
          files: ['src/App.jsx', 'src/Header.jsx', 'src/extra.jsx'],
          shortest: ['src/App.jsx', 'src/Header.jsx'],
          hint: 'Shared exports in src/App.jsx are imported back by children; move them to a separate module.',
        },
      ],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: cycleData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Cycle short loop with arrows
  assert.ok(html.includes('src/App.jsx → src/Header.jsx → src/App.jsx'))
  // Hint
  assert.ok(html.includes('Shared exports in src/App.jsx are imported back by children; move them to a separate module.'))
  // Full list of files in cycle
  assert.ok(html.includes('src/extra.jsx'))
})

test('CodeMapPanel: file explorer shows circular dependency warning note when selected file is in a cycle', () => {
  const cycleData = {
    coverage: { totalFiles: 3, graphFiles: 3 },
    inventory: { totalFiles: 3, analyzedFiles: 3 },
    graph: {
      nodes: [
        { id: 0, path: 'src/cycleA.js', lang: 'javascript', size: 100, loc: 10, fanIn: 1, fanOut: 1, isEntry: true, isOrphan: false },
        { id: 1, path: 'src/cycleB.js', lang: 'javascript', size: 100, loc: 10, fanIn: 2, fanOut: 1, isEntry: false, isOrphan: false },
        { id: 2, path: 'src/x.js', lang: 'javascript', size: 50, loc: 5, fanIn: 0, fanOut: 1, isEntry: false, isOrphan: false },
      ],
      edges: [
        [0, 1],
        [1, 0],
        [2, 1], // x imports cycleB -> x is affected by cycleA only through the cycle
      ],
      externals: [],
    },
    summary: {
      entryPoints: ['src/cycleA.js'],
      cycles: [['src/cycleA.js', 'src/cycleB.js']],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [{ path: 'src/cycleA.js', fanIn: 1 }], byTransitiveImpact: [{ path: 'src/cycleA.js', transitiveCount: 2, percent: 66.7 }] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: cycleData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.ok(html.includes('This file is part of a circular dependency; impact may be overstated by 1 file.'))
})

test('CodeMapPanel: explorer displays config tag, empty transitive message, and directly or transitively affects text', () => {
  const configData = {
    coverage: { totalFiles: 2, graphFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2 },
    graph: {
      nodes: [
        { id: 0, path: 'vite.config.js', lang: 'javascript', isConfig: true, isTest: false, size: 50, loc: 5, fanIn: 1, fanOut: 0, isEntry: false, isOrphan: false },
        { id: 1, path: 'src/main.js', lang: 'javascript', isConfig: false, isTest: false, size: 100, loc: 10, fanIn: 0, fanOut: 1, isEntry: true, isOrphan: false },
        { id: 2, path: 'src/main.test.js', lang: 'javascript', isConfig: false, isTest: true, size: 80, loc: 8, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: false },
      ],
      edges: [[1, 0]], // main imports vite.config.js -> vite.config.js has direct importer main.js, no transitive
      externals: [],
    },
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      configFiles: ['vite.config.js'],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: configData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Config tag and test tag
  assert.ok(html.includes('config-tag'))
  assert.ok(html.includes('test-tag'))
  // Headline with "directly or transitively affects N files"
  assert.ok(html.includes('compact-stat-row'))
  // Empty transitive note
  assert.ok(html.includes('No additional files beyond the direct importers.'))
})

test('CodeMapPanel: stat cards show Code Files Mapped and Other Files Inventoried with skipped note, and header matches', () => {
  const data = {
    coverage: {
      graphFiles: 45,
      totalFiles: 78,
      analyzedFiles: 77,
      skipped: { binary: 1 },
      graphLanguages: { javascript: 45 },
      inventoryOnlyLanguages: { markdown: 32 },
    },
    inventory: {
      totalFiles: 78,
      analyzedFiles: 77,
      skipped: { binary: 1 },
      byLanguage: { javascript: 45, markdown: 32, binary: 1 },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/app.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/app.js'],
      cycles: [],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // 1 & 2: Cards and Header use the same numbers: 45 code files mapped, 32 other files inventoried, 1 skipped
  assert.ok(html.includes('Code Files Mapped'))
  assert.ok(html.includes('45'))
  assert.ok(html.includes('Other Files Inventoried'))
  assert.ok(html.includes('32'))
  assert.ok(html.includes('1 skipped'))
  assert.equal(html.includes('Files Analyzed'), false)

  // Header format: "{N} code files mapped, {M} other files inventoried, {K} skipped"
  assert.ok(html.includes('45 code files mapped, 32 other files inventoried, 1 skipped'))

  // 3: Banner does NOT repeat the "{N} code files mapped" sentence
  const bannerMatch = html.match(/<div class="codemap-approximate-notice"[^>]*>([\s\S]*?)<\/div>/)
  assert.ok(bannerMatch)
  assert.equal(bannerMatch[1].includes('code files mapped'), false)
})

test('CodeMapPanel: Languages count excludes binary and other bucket (gitignore, txt)', () => {
  const data = {
    coverage: {
      graphFiles: 10,
      totalFiles: 30,
      graphLanguages: { javascript: 10 },
      inventoryOnlyLanguages: { python: 5 },
    },
    inventory: {
      totalFiles: 30,
      analyzedFiles: 25,
      byLanguage: {
        javascript: 10,
        python: 5,
        binary: 5,
        other: 3,
        gitignore: 1,
        txt: 2,
      },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/app.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/app.js'],
      cycles: [],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Only javascript and python are counted as languages -> count must be 2
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch)
  assert.equal(langCardMatch[1], '2')
})

test('CodeMapPanel: label "Svg" renders as "SVG"', () => {
  const data = {
    coverage: {
      graphFiles: 5,
      totalFiles: 10,
      graphLanguages: { javascript: 5 },
      inventoryOnlyLanguages: { svg: 5 },
    },
    inventory: {
      totalFiles: 10,
      analyzedFiles: 10,
      byLanguage: { javascript: 5, svg: 5 },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/app.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/app.js'],
      cycles: [],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Label SVG must be present and Svg must not be present
  assert.ok(html.includes('SVG: 5 files, not mapped') || html.includes('<span>SVG</span>'))
  assert.equal(html.includes('Svg:'), false)
  assert.equal(html.includes('<span>Svg</span>'), false)
})

test('CodeMapPanel: Inventory -> By Language lists every inventoried file type labelled Binary/Other and total equals analyzed + skipped', () => {
  const data = {
    coverage: {
      graphFiles: 10,
      totalFiles: 25,
      analyzedFiles: 20,
      skipped: { binary: 5 },
      graphLanguages: { javascript: 10 },
      inventoryOnlyLanguages: { python: 6, other: 4 },
    },
    inventory: {
      totalFiles: 25,
      analyzedFiles: 20,
      skipped: { binary: 5 },
      byLanguage: {
        javascript: 10,
        python: 6,
        binary: 5,
        other: 2,
        gitignore: 1,
        txt: 1,
      },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/app.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/app.js'],
      cycles: [],
      orphans: [],
      configFiles: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Labels Binary and Other must be rendered
  assert.ok(html.includes('<span>Binary</span>'), 'Includes Binary label')
  assert.ok(html.includes('<span>Other</span>'), 'Includes Other label')

  // Total in By Language list must equal analyzed + skipped (20 + 5 = 25)
  const byLangSectionMatch = html.match(/<h5>By Language<\/h5>\s*<ul class="codemap-simple-list">([\s\S]*?)<\/ul>/)
  assert.ok(byLangSectionMatch, 'Found By Language list')
  const badgeMatches = [...byLangSectionMatch[1].matchAll(/<strong class="count-badge">(\d+)<\/strong>/g)]
  const totalCount = badgeMatches.reduce((sum, m) => sum + Number(m[1]), 0)
  assert.equal(totalCount, data.inventory.analyzedFiles + 5)
})

test('CodeMapPanel: file explorer buttons and path elements have title attribute holding full path', () => {
  const data = {
    coverage: { graphFiles: 2, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'packages/vite/src/node/server/index.ts', lang: 'typescript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false },
        { id: 1, path: 'packages/vite/src/client/overlay.ts', lang: 'typescript', size: 80, loc: 8, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: false },
      ],
      edges: [],
      externals: [],
    },
    summary: { entryPoints: ['packages/vite/src/node/server/index.ts'], cycles: [], orphans: [], configFiles: [] },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.ok(
    html.includes('title="packages/vite/src/node/server/index.ts"'),
    'File explorer button/span has title attribute holding full path',
  )
  assert.ok(
    html.includes('title="packages/vite/src/client/overlay.ts"'),
    'File explorer button/span has title attribute holding full path',
  )
})

test('CodeMapPanel: header sentence lists every bucket so numbers add up (mapped code files + inventoried by type + "Other")', () => {
  const data = {
    coverage: {
      graphFiles: 45,
      totalFiles: 80,
      analyzedFiles: 77,
      skipped: { binary: 3 },
      graphLanguages: { javascript: 45 },
      inventoryOnlyLanguages: { python: 20, other: 12 },
    },
    inventory: {
      totalFiles: 80,
      analyzedFiles: 77,
      skipped: { binary: 3 },
      byLanguage: { javascript: 45, python: 20, other: 7, gitignore: 3, txt: 2, binary: 3 },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: { entryPoints: ['src/main.js'], cycles: [], orphans: [], configFiles: [] },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Header lists 45 code files; 32 other files (20 Python + 12 Other); 3 skipped
  // 45 + 20 + 12 = 77 analyzed files!
  assert.ok(html.includes('45 code files mapped, 32 other files inventoried, 3 skipped'))
  assert.ok(html.includes('Python: 20 files, not mapped, other file types: 12 files, not mapped'))
})

test('CodeMapPanel: Languages card number strictly equals the number of languages listed under By Language', () => {
  const data = {
    coverage: {
      graphFiles: 10,
      totalFiles: 35,
      analyzedFiles: 30,
      skipped: { binary: 5 },
      graphLanguages: { javascript: 10 },
      inventoryOnlyLanguages: { python: 8, json: 5, other: 7 },
    },
    inventory: {
      totalFiles: 35,
      analyzedFiles: 30,
      skipped: { binary: 5 },
      byLanguage: {
        javascript: 10,
        python: 8,
        json: 5,
        binary: 5,
        other: 4,
        gitignore: 2,
        txt: 1,
      },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: { entryPoints: ['src/main.js'], cycles: [], orphans: [], configFiles: [] },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // In By Language: javascript, python (2 programming languages), json (Data and docs), Binary, Other
  // Languages card counts only PROGRAMMING entries with count > 0 -> 2
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch)
  assert.equal(langCardMatch[1], '2')

  // Verify the three section headings are rendered
  assert.ok(html.includes('<h6 class="by-lang-heading">Languages</h6>'), 'Languages heading rendered')
  assert.ok(html.includes('<h6 class="by-lang-heading">Data and docs</h6>'), 'Data and docs heading rendered')
  assert.ok(html.includes('Other file types'), 'Other file types heading rendered')

  // Count items listed in By Language under the Languages heading
  const byLangSectionMatch = html.match(/<h5>By Language<\/h5>\s*<ul class="codemap-simple-list">([\s\S]*?)<\/ul>/)
  assert.ok(byLangSectionMatch)
  assert.ok(byLangSectionMatch[1].includes('<span>JavaScript</span>'))
  assert.ok(byLangSectionMatch[1].includes('<span>Python</span>'))
  assert.ok(byLangSectionMatch[1].includes('<span>JSON</span>'))
  assert.ok(byLangSectionMatch[1].includes('<span>Binary</span>'))
  assert.ok(byLangSectionMatch[1].includes('<span>Other</span>'))
})

test('CodeMapPanel: unresolved imports stat card is a button when count > 0 with aria attributes, and toggles panel below stat cards', () => {
  const data = {
    coverage: { graphFiles: 1, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      unresolvedCount: 3,
      unresolvedImports: [
        { from: 'src/main.js', specifier: './missing', reason: 'relative-not-found', category: 'production' },
      ],
    },
  }

  // When panel is closed (default)
  const htmlClosed = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: false,
    }),
  )

  assert.ok(
    htmlClosed.includes('aria-expanded="false"'),
    'Unresolved card is a button with aria-expanded="false"',
  )
  assert.ok(
    htmlClosed.includes('aria-controls="codemap-unresolved-panel"'),
    'Unresolved card is a button with aria-controls="codemap-unresolved-panel"',
  )
  assert.equal(htmlClosed.includes('id="codemap-unresolved-panel"'), false, 'Unresolved panel is not rendered when closed')

  // When panel is open
  const htmlOpen = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
    }),
  )

  assert.ok(
    htmlOpen.includes('aria-expanded="true"'),
    'Unresolved card button has aria-expanded="true" when panel is open',
  )
  assert.ok(
    htmlOpen.includes('id="codemap-unresolved-panel"'),
    'Unresolved panel is rendered when open',
  )
})

test('CodeMapPanel: zero-count unresolved imports card is not clickable (div) and displays "none"', () => {
  const data = {
    coverage: { graphFiles: 1, totalFiles: 1, analyzedFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      unresolvedCount: 0,
      unresolvedImports: [],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.equal(
    html.includes('aria-controls="codemap-unresolved-panel"'),
    false,
    'Zero-count unresolved card is not a button with aria-controls',
  )

  const cardMatch = html.match(/<div class="codemap-card">\s*<span class="codemap-card-label">Unresolved Imports<\/span>\s*<strong class="codemap-card-value">\s*none\s*<\/strong>[\s\S]*?<\/div>/)
  assert.ok(cardMatch, 'Zero-count card renders as a div with value "none"')
})

test('CodeMapPanel: unresolved imports panel displays title with count, truncated notice when capped, and groups by reason with explanations', () => {
  const data = {
    coverage: { graphFiles: 1, totalFiles: 1, analyzedFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    unresolvedTruncated: true,
    unresolvedCount: 5,
    unresolvedImports: [
      { from: 'src/main.js', specifier: './relative-missing', reason: 'relative-not-found', category: 'production' },
      { from: 'src/main.js', specifier: './dir-missing', reason: 'directory-index-not-found', category: 'production' },
      { from: 'src/main.js', specifier: '@/components/foo', reason: 'alias-unresolved', category: 'production' },
      { from: 'src/main.js', specifier: '#subpath/bar', reason: 'package-imports-unresolved', category: 'production' },
      { from: 'src/main.js', specifier: 'strange?query', reason: 'other', category: 'production' },
    ],
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      unresolvedCount: 5,
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
    }),
  )

  assert.ok(html.includes('Unresolved imports (5)'), 'Panel has title with count')
  assert.ok(
    html.includes('Analysis capped at 500 unresolved imports. Additional imports omitted.'),
    'Truncated notice is rendered',
  )

  assert.ok(html.includes('Relative not found (1)'))
  assert.ok(html.includes('relative path does not exist on disk'))
  assert.ok(html.includes('Directory index not found (1)'))
  assert.ok(html.includes('directory exists or was specified, but directory index file (index.js/ts) was not found'))
  assert.ok(html.includes('Alias unresolved (1)'))
  assert.ok(html.includes('alias could not be read from tsconfig, vite or webpack config'))
  assert.ok(html.includes('Package imports unresolved (1)'))
  assert.ok(html.includes('subpath import (#) could not be resolved from package.json imports'))
  assert.ok(html.includes('Other unresolved imports (1)'))
  assert.ok(html.includes('unresolved import or unrecognized module specifier'))

  assert.ok(html.includes('class="unresolved-specifier-code font-mono"'))
  assert.ok(html.includes('title="./relative-missing"'))
  assert.ok(html.includes('aria-label="Inspect src/main.js"'))
})

test('CodeMapPanel: unresolved imports panel filter toggle excludes non-production by default, includes when checked', () => {
  const data = {
    coverage: { graphFiles: 1, totalFiles: 1, analyzedFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    unresolvedCount: 2,
    unresolvedImports: [
      { from: 'src/prod.js', specifier: './prod-dep', reason: 'relative-not-found', category: 'production' },
      { from: 'test/test.js', specifier: './test-dep', reason: 'relative-not-found', category: 'non-production' },
    ],
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      unresolvedCount: 2,
    },
  }

  const htmlFiltered = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
      initialIncludeNonProd: false,
    }),
  )

  assert.ok(htmlFiltered.includes('Unresolved imports (1)'))
  assert.ok(htmlFiltered.includes('src/prod.js'))
  assert.equal(htmlFiltered.includes('test/test.js'), false, 'Non-production import excluded by default')

  const htmlAll = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
      initialIncludeNonProd: true,
    }),
  )

  assert.ok(htmlAll.includes('Unresolved imports (2)'))
  assert.ok(htmlAll.includes('src/prod.js'))
  assert.ok(htmlAll.includes('test/test.js'), 'Non-production import included when toggle is on')
})

test('CodeMapPanel: reason groups with >30 rows show "Show all N" button, and show all rows when expanded', () => {
  const items = []
  for (let i = 1; i <= 35; i++) {
    items.push({
      from: `src/file${i}.js`,
      specifier: `./missing-${i}`,
      reason: 'relative-not-found',
      category: 'production',
    })
  }

  const data = {
    coverage: { graphFiles: 1, totalFiles: 1, analyzedFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false }],
      edges: [],
      externals: [],
    },
    unresolvedCount: 35,
    unresolvedImports: items,
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      unresolvedCount: 35,
    },
  }

  const htmlCollapsed = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
      initialExpandedReasons: {},
    }),
  )

  assert.ok(htmlCollapsed.includes('Show all 35'), 'Displays "Show all 35" button')
  assert.ok(htmlCollapsed.includes('src/file30.js'), '30th row is rendered')
  assert.equal(htmlCollapsed.includes('src/file31.js'), false, '31st row is omitted when not expanded')

  const htmlExpanded = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
      initialShowUnresolvedPanel: true,
      initialExpandedReasons: { 'relative-not-found': true },
    }),
  )

  assert.ok(htmlExpanded.includes('Show fewer'), 'Displays "Show fewer" button when expanded')
  assert.ok(htmlExpanded.includes('src/file31.js'), '31st row is rendered when expanded')
  assert.ok(htmlExpanded.includes('src/file35.js'), '35th row is rendered when expanded')
})

test('CodeMapPanel: Entry Points, Cycles, and Orphans stat cards are buttons when count > 0 and divs when 0', () => {
  const dataWithCounts = {
    coverage: { graphFiles: 2, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'src/entry.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: true, isOrphan: false },
        { id: 1, path: 'src/orphan.js', lang: 'javascript', size: 80, loc: 8, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: true },
      ],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/entry.js'],
      cycles: [['src/a.js', 'src/b.js']],
      orphans: ['src/orphan.js'],
    },
  }

  const htmlButtons = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: dataWithCounts,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.ok(htmlButtons.includes('aria-label="View 1 entry points"'))
  assert.ok(htmlButtons.includes('aria-label="View 1 circular dependencies"'))
  assert.ok(htmlButtons.includes('aria-label="View 1 orphan files"'))

  const dataZero = {
    coverage: { graphFiles: 1, totalFiles: 1, analyzedFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1, byLanguage: { javascript: 1 } },
    graph: {
      nodes: [{ id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 0, isEntry: false, isOrphan: false }],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: [],
      cycles: [],
      orphans: [],
    },
  }

  const htmlZero = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: dataZero,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.equal(htmlZero.includes('aria-label="View 0 entry points"'), false)
  assert.equal(htmlZero.includes('aria-label="View 0 circular dependencies"'), false)
  assert.equal(htmlZero.includes('aria-label="View 0 orphan files"'), false)

  assert.ok(htmlZero.includes('<span class="codemap-card-label">Entry Points</span><strong class="codemap-card-value">none</strong>'))
  assert.ok(htmlZero.includes('<span class="codemap-card-label">Cycles</span><strong class="codemap-card-value">0</strong>'))
  assert.ok(htmlZero.includes('<span class="codemap-card-label">Orphans</span><strong class="codemap-card-value">0</strong>'))
})

test('CodeMapPanel: Toggle changes cards, cycles, orphans, and unresolved panel together', () => {
  const data = {
    coverage: { graphFiles: 4, totalFiles: 6, analyzedFiles: 6 },
    inventory: { totalFiles: 6, analyzedFiles: 6, byLanguage: { javascript: 4, other: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'src/a.js', lang: 'javascript', category: 'production' },
        { id: 1, path: 'src/b.js', lang: 'javascript', category: 'production' },
        { id: 2, path: 'src/orphan.js', lang: 'javascript', category: 'production' },
        { id: 3, path: 'tests/test.js', lang: 'javascript', category: 'non-production' },
      ],
      edges: [[0, 1], [1, 0]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/a.js'],
      cycles: [['src/a.js', 'src/b.js']],
      orphans: ['src/orphan.js'],
      nonProdOrphans: ['tests/orphan.test.js'],
      nonProdCycles: [['tests/testA.js', 'tests/testB.js']],
      typeOnlyCycles: [{ shortest: ['src/typeA.ts', 'src/typeB.ts'], hint: 'type loop' }],
      unresolvedCount: 3,
      unresolvedImports: [
        { from: 'src/a.js', specifier: './missing-prod', reason: 'relative-not-found', category: 'production' },
        { from: 'tests/test.js', specifier: './missing-test', reason: 'relative-not-found', category: 'non-production' },
      ],
      nonProduction: {
        cycles: 1,
        orphans: 1,
        unresolved: 1,
      },
    },
  }

  // Toggle OFF (default)
  const htmlOff = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      initialIncludeNonProd: false,
      initialShowUnresolvedPanel: true,
      onRerun: () => {},
    }),
  )

  // Cards show production counts with (+N in tests/fixtures) suffix in dedicated subline
  assert.ok(htmlOff.includes('<div class="codemap-card-subline">(+1 in tests/fixtures)</div>'), 'Cycles suffix shown')
  assert.ok(htmlOff.includes('<div class="codemap-card-subline">(+1 in tests/fixtures)</div>'), 'Orphans suffix shown')
  assert.ok(htmlOff.includes('<div class="codemap-card-subline">(+1 in tests/fixtures)</div>'), 'Unresolved suffix shown')
  assert.ok(htmlOff.includes('Unresolved imports (1)'), 'Unresolved panel shows production items count')
  assert.ok(htmlOff.includes('type-only, no runtime effect'), 'Type-only cycles reported separately')

  // Toggle ON
  const htmlOn = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      initialIncludeNonProd: true,
      initialShowUnresolvedPanel: true,
      onRerun: () => {},
    }),
  )

  // Cards show combined counts and suffix is hidden
  assert.equal(htmlOn.includes('in tests/fixtures'), false, 'Suffix hidden when toggle is ON')
  assert.ok(htmlOn.includes('<span class="codemap-card-label">Cycles</span><strong class="codemap-card-value text-warn">2</strong>'))
  assert.ok(htmlOn.includes('<span class="codemap-card-label">Orphans</span><strong class="codemap-card-value">2</strong>'))
  assert.ok(htmlOn.includes('<span class="codemap-card-label">Unresolved Imports</span><strong class="codemap-card-value text-warn">2</strong>'))
  assert.ok(htmlOn.includes('Unresolved imports (2)'), 'Unresolved panel shows total items count')
})

test('CodeMapPanel: "(+N in tests/fixtures)" shows when N > 0 and hides when N == 0', () => {
  const dataZeroNonProd = {
    coverage: { graphFiles: 2, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'src/a.js', lang: 'javascript', category: 'production' },
        { id: 1, path: 'src/b.js', lang: 'javascript', category: 'production' },
      ],
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: ['src/a.js'],
      cycles: [],
      orphans: ['src/b.js'],
      unresolvedCount: 1,
      unresolvedImports: [
        { from: 'src/a.js', specifier: './x', reason: 'relative-not-found', category: 'production' },
      ],
      nonProduction: {
        cycles: 0,
        orphans: 0,
        unresolved: 0,
      },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: dataZeroNonProd,
      status: 'success',
      initialIncludeNonProd: false,
      onRerun: () => {},
    }),
  )

  assert.equal(html.includes('in tests/fixtures'), false, 'No suffix rendered when N is 0')
})

test('CodeMapPanel: "Show all N" button at 30+ items', () => {
  const manyOrphans = Array.from({ length: 35 }, (_, i) => `src/orphan-${i}.js`)
  const data = {
    coverage: { graphFiles: 35, totalFiles: 35, analyzedFiles: 35 },
    inventory: { totalFiles: 35, analyzedFiles: 35, byLanguage: { javascript: 35 } },
    graph: {
      nodes: manyOrphans.map((p, id) => ({ id, path: p, lang: 'javascript', category: 'production' })),
      edges: [],
      externals: [],
    },
    summary: {
      entryPoints: [],
      cycles: [],
      orphans: manyOrphans,
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.ok(html.includes('Show all 35'), 'Renders Show all 35 button for orphans')
  assert.ok(html.includes('src/orphan-0.js'))
  assert.ok(html.includes('src/orphan-29.js'))
  assert.equal(html.includes('src/orphan-30.js'), false, 'Omit item 31 when collapsed')
})

test('CodeMapPanel: per-package grouping and aggregate fallback', () => {
  const dataWithPackages = {
    coverage: { graphFiles: 2, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'packages/core/src/index.js', lang: 'javascript', category: 'production' },
        { id: 1, path: 'packages/cli/src/index.js', lang: 'javascript', category: 'production' },
      ],
      edges: [],
      externals: [{ name: 'chalk', count: 2, declared: true }],
    },
    summary: {
      entryPoints: [],
      cycles: [],
      orphans: [],
      declaredButUnused: ['chalk', 'lodash'],
      declaredButUnusedNote: 'may be used via config or string references',
      usedButUndeclared: ['@clack/prompts'],
      undeclaredSources: { '@clack/prompts': ['packages/cli/src/index.js'] },
      packages: [
        {
          name: '@my/core',
          dir: 'packages/core',
          declaredButUnused: ['lodash'],
          declaredButUnusedNote: 'may be used via config or string references',
          usedButUndeclared: [],
        },
        {
          name: '@my/cli',
          dir: 'packages/cli',
          declaredButUnused: ['chalk'],
          usedButUndeclared: ['@clack/prompts'],
          undeclaredSources: { '@clack/prompts': ['packages/cli/src/index.js'] },
        },
      ],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: dataWithPackages,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.ok(html.includes('@my/core'), 'Renders package @my/core')
  assert.ok(html.includes('@my/cli'), 'Renders package @my/cli')
  assert.ok(html.includes('used in: packages/cli/src/index.js'), 'Displays undeclaredSources')
  assert.ok(html.includes('All packages (aggregate)'), 'Renders aggregate tab/section')
  assert.ok(html.includes('may be used via config or string references'), 'Shows declaredButUnusedNote')

  // Aggregate fallback when summary.packages is omitted
  const dataFallback = {
    ...dataWithPackages,
    summary: {
      ...dataWithPackages.summary,
      packages: undefined,
    },
  }

  const htmlFallback = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: dataFallback,
      status: 'success',
      onRerun: () => {},
    }),
  )

  assert.equal(htmlFallback.includes('@my/core'), false, 'No per-package details in fallback mode')
  assert.ok(htmlFallback.includes('Declared but Unused (2)'), 'Renders aggregate declared but unused')
  assert.ok(htmlFallback.includes('may be used via config or string references'), 'Shows note in fallback mode')
})

test('NeighborhoodGraph: labels nodes as parentFolder/file when basenames collide', () => {
  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodGraph, {
      selectedFile: 'packages/vite/src/node/utils.ts',
      importers: ['packages/vite/src/shared/utils.ts', 'packages/vite/src/client/helper.ts'],
      imports: ['packages/vite/src/shared/utils.ts'],
      onSelectFile: () => {},
    }),
  )

  // utils.ts collides across node and shared -> labeled with parentFolder/file
  assert.ok(html.includes('node/utils.ts'), 'Center node labeled node/utils.ts')
  assert.ok(html.includes('shared/utils.ts'), 'Side node labeled shared/utils.ts')
  // helper.ts has no collision -> labeled helper.ts
  assert.ok(html.includes('helper.ts'), 'Unique basename labeled helper.ts')
  // Tooltips & accessible names preserve full path
  assert.ok(html.includes('<title>packages/vite/src/node/utils.ts</title>'))
  assert.ok(html.includes('aria-label="Select packages/vite/src/shared/utils.ts"'))
})

test('getImpact: splits direct and transitive impact into source and tests counts', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/core.js', category: 'production' },
      { id: 1, path: 'src/service.js', category: 'production' },
      { id: 2, path: 'tests/core.test.js', category: 'non-production' },
      { id: 3, path: 'tests/service.test.js', category: 'non-production' },
    ],
    edges: [
      [1, 0], // service imports core
      [2, 0], // core.test imports core
      [3, 1], // service.test imports service -> transitive to core
    ],
  }

  const impact = getImpact(graph, 'src/core.js')
  assert.equal(impact.direct.length, 2)
  assert.deepStrictEqual(impact.directBreakdown, { source: 1, tests: 1 })
  assert.equal(impact.directText, '2 direct: 1 source, 1 tests')

  assert.equal(impact.transitive.length, 1)
  assert.deepStrictEqual(impact.transitiveBreakdown, { source: 0, tests: 1 })
  assert.equal(impact.transitiveText, '1 transitive: 0 source, 1 tests')
})

test('CodeMapPanel: Languages card equals listed real languages and excludes binary, config/other and Other', () => {
  const data = {
    coverage: { graphFiles: 2, totalFiles: 8, analyzedFiles: 8 },
    inventory: {
      totalFiles: 8,
      analyzedFiles: 8,
      byLanguage: {
        javascript: 4,
        typescript: 2,
        binary: 1,
        'config/other': 1,
        other: 2,
        'packages/vite/index.js': 1, // file path must not appear as language name
      },
    },
    graph: {
      nodes: [
        { id: 0, path: 'src/a.js', lang: 'javascript', category: 'production' },
        { id: 1, path: 'src/b.ts', lang: 'typescript', category: 'production' },
      ],
      edges: [],
      externals: [],
    },
    summary: { entryPoints: [], cycles: [], orphans: [] },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Real languages count: JavaScript + TypeScript = 2
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch)
  assert.equal(langCardMatch[1], '2', 'Languages card equals 2')

  // Under By Language, "Other file types" heading separates Binary, Other, config/other
  assert.ok(html.includes('Other file types'), 'Other file types heading rendered')
  assert.ok(html.includes('<span>JavaScript</span>'))
  assert.ok(html.includes('<span>TypeScript</span>'))
  assert.ok(html.includes('<span>Binary</span>'))
  assert.ok(html.includes('<span>Other</span>'))
  assert.ok(html.includes('<span>config/other</span>'))
  assert.equal(html.includes('<span>packages/vite/index.js</span>'), false, 'File path never appears as a language name')
})

test('CodeMapPanel: bucket list appears once inside Approximate analysis box', () => {
  const data = {
    coverage: {
      graphFiles: 46,
      totalFiles: 78,
      analyzedFiles: 77,
      skipped: { binary: 1 },
      graphLanguages: { javascript: 46 },
      inventoryOnlyLanguages: { yaml: 23, other: 8 },
    },
    inventory: {
      totalFiles: 78,
      analyzedFiles: 77,
      skipped: { binary: 1 },
      byLanguage: { javascript: 46, yaml: 23, other: 8, binary: 1 },
    },
    graph: {
      nodes: [{ id: 0, path: 'src/index.js', lang: 'javascript', category: 'production' }],
      edges: [],
      externals: [],
    },
    summary: { entryPoints: [], cycles: [], orphans: [] },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Header line is short
  assert.ok(html.includes('46 code files mapped, 31 other files inventoried, 1 skipped'))
  // Detailed bucket string appears exactly ONCE in the entire HTML document
  const occurrences = html.split('YAML: 23 files, not mapped').length - 1
  assert.equal(occurrences, 1, 'Bucket list appears exactly once in Approximate analysis box')
})

test('CodeMapPanel: merges language variants and extensions using Vite response shape, formats stat cards and action column', () => {
  const viteData = {
    coverage: {
      graphFiles: 1569,
      totalFiles: 3108,
      analyzedFiles: 3019,
      skipped: { binary: 89 },
    },
    inventory: {
      totalFiles: 3108,
      analyzedFiles: 3019,
      skipped: { binary: 89 },
      byLanguage: {
        'config/other': 59,
        yaml: 23,
        markdown: 84,
        json5: 1,
        typescript: 592,
        vue: 26,
        css: 250,
        javascript: 977,
        svg: 113,
        binary: 89,
        json: 392,
        toml: 1,
        html: 160,
        tsx: 17,
        jsx: 9,
        svelte: 6,
        snap: 7,
        lock: 2,
        txt: 9,
        map: 5,
        patch: 3,
        unknown: 1,
        custom: 1,
        pcss: 1,
        sss: 3,
        styl: 6,
        wxss: 1,
        crt: 1,
        dot: 1,
        notjs: 1,
        astro: 1,
        es: 1,
        pug: 1,
        sh: 5,
      },
      byFolder: { src: 1200, packages: 1500 },
      largest: [{ path: 'packages/vite/dist/client/client.mjs', size: 50000 }],
    },
    graph: {
      nodes: [
        { id: 0, path: 'packages/vite/src/node/index.ts', lang: 'typescript', category: 'production' },
        { id: 1, path: 'packages/vite/src/client/client.ts', lang: 'typescript', category: 'production' },
      ],
      edges: [[0, 1]],
      externals: [],
    },
    summary: {
      entryPoints: ['packages/vite/src/node/index.ts'],
      cycles: [],
      orphans: [],
      hotspots: {
        byFanIn: [{ path: 'packages/vite/src/node/index.ts', fanIn: 45 }],
        byTransitiveImpact: [{ path: 'packages/vite/src/node/index.ts', transitiveCount: 120, percent: 7.6 }],
      },
      nonProduction: {
        cycles: 2,
        orphans: 5,
        unresolved: 8,
      },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: viteData,
      status: 'success',
      initialIncludeNonProd: false,
      onRerun: () => {},
    }),
  )

  // 1. Action column has className="col-action" and Inspect button
  assert.ok(html.includes('<th scope="col" class="col-action">Action</th>'), 'Action column header has col-action')
  assert.ok(html.includes('<td class="col-action">'), 'Action cell has col-action')
  assert.ok(html.includes('Inspect</button>'), 'Inspect button rendered in action column')

  // 2. Stat cards render dedicated subline for uniform height
  assert.ok(html.includes('<div class="codemap-card-subline">(+2 in tests/fixtures)</div>'), 'Cycles subline rendered')
  assert.ok(html.includes('<div class="codemap-card-subline">(+5 in tests/fixtures)</div>'), 'Orphans subline rendered')
  assert.ok(html.includes('<div class="codemap-card-subline">(+8 in tests/fixtures)</div>'), 'Unresolved subline rendered')
  assert.ok(html.includes('<div class="codemap-card-subline">(89 skipped)</div>'), 'Other files subline rendered with skipped')
  assert.ok(html.includes('<div class="codemap-card-subline">&nbsp;</div>') || html.includes('<div class="codemap-card-subline">\u00A0</div>'), 'Empty cards render subline')

  // 3. Title line with thousands separators
  assert.ok(
    html.includes('1,569 code files mapped, 1,450 other files inventoried, 89 skipped'),
    'Title line formatted with thousands separators',
  )

  // 4. By Language renders 3 groups under headings: "Languages", "Data and docs", "Other file types"
  assert.ok(html.includes('<h6 class="by-lang-heading">Languages</h6>'), 'Languages heading rendered')
  assert.ok(html.includes('<h6 class="by-lang-heading">Data and docs</h6>'), 'Data and docs heading rendered')
  assert.ok(html.includes('Other file types'), 'Other file types heading rendered')

  // Merged language variants in Vite response shape
  // JSON: 392 + 1 (json5) = 393 in Data and docs
  assert.ok(html.includes('<span>JSON</span>\n<strong class="count-badge">393</strong>') ||
            html.includes('<span>JSON</span><strong class="count-badge">393</strong>'))
  // JavaScript: 977 + 1 (es) = 978 in Languages
  assert.ok(html.includes('<span>JavaScript</span>\n<strong class="count-badge">978</strong>') ||
            html.includes('<span>JavaScript</span><strong class="count-badge">978</strong>'))
  // CSS: 250 + 1 (pcss) + 3 (sss) + 6 (styl) + 1 (wxss) = 261 in Languages
  assert.ok(html.includes('<span>CSS</span>\n<strong class="count-badge">261</strong>') ||
            html.includes('<span>CSS</span><strong class="count-badge">261</strong>'))
  // TypeScript: 592 in Languages
  assert.ok(html.includes('<span>TypeScript</span>\n<strong class="count-badge">592</strong>') ||
            html.includes('<span>TypeScript</span><strong class="count-badge">592</strong>'))

  // None of the merged variants appear as standalone languages
  assert.equal(html.includes('<span>Json5</span>'), false, 'json5 is merged into JSON')
  assert.equal(html.includes('<span>Pcss</span>'), false, 'pcss is merged into CSS')
  assert.equal(html.includes('<span>Sss</span>'), false, 'sss is merged into CSS')
  assert.equal(html.includes('<span>Styl</span>'), false, 'styl is merged into CSS')
  assert.equal(html.includes('<span>Wxss</span>'), false, 'wxss is merged into CSS')
  assert.equal(html.includes('<span>Es</span>'), false, 'es is merged into JavaScript')

  // 5. Languages card counts ONLY PROGRAMMING entries with count > 0: exactly 10 for Vite (Shell included)
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch, 'Languages card found')
  assert.equal(langCardMatch[1], '10', 'Vite shape gives exactly 10 languages (Shell included)')
  assert.ok(html.includes('<span>Shell</span>'), 'Shell appears under Languages')

  // snap, map, lock, patch, crt, dot, notjs, custom and unknown are NEVER counted as languages
  const uncounted = ['snap', 'map', 'lock', 'patch', 'crt', 'dot', 'notjs', 'custom', 'unknown']
  for (const name of uncounted) {
    const titleCased = name.charAt(0).toUpperCase() + name.slice(1)
    assert.equal(html.includes(`<span>${titleCased}</span>`), false, `${titleCased} must not appear as a language name`)
    assert.ok(html.includes(`<span>${name}</span>`), `${name} appears under Other file types as lowercase raw extension`)
  }
})

test('CodeMapPanel: Skinveda shape gives 5 languages and excludes non-languages', () => {
  const skinvedaData = {
    coverage: {
      graphFiles: 142,
      totalFiles: 210,
      analyzedFiles: 205,
      skipped: { binary: 5 },
    },
    inventory: {
      totalFiles: 210,
      analyzedFiles: 205,
      skipped: { binary: 5 },
      byLanguage: {
        typescript: 95,
        tsx: 32,
        javascript: 10,
        jsx: 3,
        css: 2,
        json: 25,
        svg: 15,
        markdown: 8,
        snap: 6,
        map: 3,
        lock: 1,
        patch: 1,
        crt: 1,
        dot: 1,
        notjs: 1,
        custom: 1,
        unknown: 1,
        binary: 5,
        other: 2,
      },
      byFolder: { src: 120, components: 40 },
      largest: [{ path: 'src/app.tsx', size: 12000 }],
    },
    graph: {
      nodes: [
        { id: 0, path: 'src/index.tsx', lang: 'tsx', category: 'production' },
        { id: 1, path: 'src/app.tsx', lang: 'tsx', category: 'production' },
      ],
      edges: [[0, 1]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/index.tsx'],
      cycles: [],
      orphans: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: skinvedaData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // 1. Languages card counts only PROGRAMMING entries with count > 0: exactly 5 for Skinveda
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch, 'Languages card found')
  assert.equal(langCardMatch[1], '5', 'Skinveda shape gives exactly 5 languages')

  // 2. Headings for the three groups
  assert.ok(html.includes('<h6 class="by-lang-heading">Languages</h6>'), 'Languages heading rendered')
  assert.ok(html.includes('<h6 class="by-lang-heading">Data and docs</h6>'), 'Data and docs heading rendered')
  assert.ok(html.includes('Other file types'), 'Other file types heading rendered')

  // 3. Programming languages listed: TypeScript, TSX, JavaScript, JSX, CSS
  assert.ok(html.includes('<span>TypeScript</span>'))
  assert.ok(html.includes('<span>TSX</span>'))
  assert.ok(html.includes('<span>JavaScript</span>'))
  assert.ok(html.includes('<span>JSX</span>'))
  assert.ok(html.includes('<span>CSS</span>'))

  // 4. Data and docs: JSON, SVG, Markdown
  assert.ok(html.includes('<span>JSON</span>'))
  assert.ok(html.includes('<span>SVG</span>'))
  assert.ok(html.includes('<span>Markdown</span>'))

  // 5. snap, map, lock, patch, crt, dot, notjs, custom, unknown are never counted as languages
  const uncounted = ['snap', 'map', 'lock', 'patch', 'crt', 'dot', 'notjs', 'custom', 'unknown']
  for (const name of uncounted) {
    const titleCased = name.charAt(0).toUpperCase() + name.slice(1)
    assert.equal(html.includes(`<span>${titleCased}</span>`), false, `${titleCased} must not appear as a language name`)
    assert.ok(html.includes(`<span>${name}</span>`), `${name} appears under Other file types as lowercase raw extension`)
  }
})

test('CodeMapPanel: Dependencies visibility defaults, sorting, 5-cap, and zero-issues collapse', () => {
  const packagesData = {
    coverage: { graphFiles: 10, totalFiles: 10, analyzedFiles: 10 },
    inventory: { totalFiles: 10, analyzedFiles: 10, byLanguage: { javascript: 10 } },
    graph: {
      nodes: [
        { id: 0, path: 'packages/pkg-0/src/index.js', lang: 'javascript', category: 'production' },
      ],
      edges: [],
      externals: [{ name: 'ext-1', count: 1, declared: true }],
    },
    summary: {
      entryPoints: [],
      cycles: [],
      orphans: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
      declaredButUnused: ['unused-global'],
      usedButUndeclared: ['undec-global'],
      nonProduction: { packages: 1 },
      packages: [
        { name: 'pkg-1-issue', dir: 'packages/p1', declaredButUnused: ['a'], usedButUndeclared: [] },
        { name: 'pkg-5-issues', dir: 'packages/p5', declaredButUnused: ['a', 'b', 'c'], usedButUndeclared: ['d', 'e'] },
        { name: 'pkg-3-issues', dir: 'packages/p3', declaredButUnused: ['a'], usedButUndeclared: ['b', 'c'] },
        { name: 'pkg-2-issues-a', dir: 'packages/p2a', declaredButUnused: ['a', 'b'], usedButUndeclared: [] },
        { name: 'pkg-2-issues-b', dir: 'packages/p2b', declaredButUnused: ['a'], usedButUndeclared: ['b'] },
        { name: 'pkg-2-issues-c', dir: 'packages/p2c', declaredButUnused: [], usedButUndeclared: ['a', 'b'] },
        { name: 'pkg-1-issue-z', dir: 'packages/p1z', declaredButUnused: [], usedButUndeclared: ['z'] },
        { name: 'clean-pkg-1', dir: 'packages/clean1', declaredButUnused: [], usedButUndeclared: [] },
        { name: 'clean-pkg-2', dir: 'packages/clean2', declaredButUnused: [], usedButUndeclared: [] },
        { name: 'test-pkg', dir: 'packages/test-suite', isNonProduction: true, declaredButUnused: ['mocha', 'chai', 'jest', 'vitest', 'sinon', 'supertest'], usedButUndeclared: [] },
      ],
    },
  }

  // 1. Render with toggle OFF
  const htmlOff = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: packagesData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: false,
    }),
  )

  // Aggregate summary on top with note:
  assert.ok(htmlOff.includes('All packages (aggregate)'), 'Aggregate header present')
  assert.ok(htmlOff.includes('1 unused, 1 undeclared across 9 packages (2 with no issues) (+1 in tests/fixtures)'), 'Aggregate summary format with suffix')

  // Aggregate <details> is closed by default
  assert.ok(htmlOff.includes('class="codemap-package-group aggregate-group"') && !htmlOff.includes('class="codemap-package-group aggregate-group" open'), 'Aggregate is collapsed by default')

  // Collapse all / Expand all controls exist
  assert.ok(htmlOff.includes('Expand all'), 'Expand all button present')
  assert.ok(htmlOff.includes('Collapse all'), 'Collapse all button present')

  // Sorted by issue count: pkg-5-issues is first, so it is the first package with issues and open by default
  assert.ok(htmlOff.includes('open="" class="codemap-package-group"') || htmlOff.includes('class="codemap-package-group" open'), 'First package with issues is open by default')
  assert.ok(htmlOff.includes('pkg-5-issues'), 'pkg-5-issues is rendered')

  // Verify that all subsequent packages with issues are closed by default (no open attribute)
  const pkgDetailsTags = [...htmlOff.matchAll(/<details\b[^>]*class="[^"]*codemap-package-group(?!\s+aggregate-group)[^"]*"[^>]*>/g)].map((m) => m[0])
  assert.ok(pkgDetailsTags.length >= 2, 'Multiple package groups rendered')
  assert.ok(pkgDetailsTags[0].includes('open'), 'First package with issues has open attribute')
  for (let i = 1; i < pkgDetailsTags.length; i++) {
    assert.equal(pkgDetailsTags[i].includes('open'), false, `Package ${i} must be closed by default`)
  }

  // 5-item cap: 7 packages with issues -> only first 5 shown initially, plus "Show all 7 packages"
  assert.ok(htmlOff.includes('Show all 7 packages'), 'Show all 7 packages button rendered')

  // Zero-issue packages collapsed into one line
  assert.ok(htmlOff.includes('2 other packages have no issues'), '2 other packages have no issues line rendered')
  assert.ok(htmlOff.includes('Show them'), 'Show them button rendered')
  assert.equal(htmlOff.includes('clean-pkg-1'), false, 'clean-pkg-1 is collapsed into one line by default')

  // Singular test: exactly 1 zero-issue package (with 2 total packages)
  const singleZeroData = {
    ...packagesData,
    summary: {
      ...packagesData.summary,
      packages: [
        { name: 'pkg-with-issues', dir: 'packages/p1', declaredButUnused: ['a'], usedButUndeclared: [] },
        { name: 'pkg-clean', dir: 'packages/p2', declaredButUnused: [], usedButUndeclared: [] },
      ],
    },
  }
  const htmlSingleZero = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: singleZeroData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: false,
    }),
  )
  assert.ok(htmlSingleZero.includes('1 other package has no issues'), 'Singular form "1 other package has no issues"')

  // Single total package project: zero-issues row must be hidden completely
  const singleTotalData = {
    ...packagesData,
    summary: {
      ...packagesData.summary,
      packages: [
        { name: 'pkg-only', dir: 'packages/p1', declaredButUnused: [], usedButUndeclared: [] },
      ],
    },
  }
  const htmlSingleTotal = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: singleTotalData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: false,
    }),
  )
  assert.equal(htmlSingleTotal.includes('has no issues'), false, 'Zero-issues row hidden when only 1 package in total')
  assert.equal(htmlSingleTotal.includes('have no issues'), false, 'Zero-issues row hidden when only 1 package in total')

  // Non-production package is hidden when toggle is off
  assert.equal(htmlOff.includes('test-pkg'), false, 'Non-production test-pkg is hidden when toggle is OFF')

  // 2. Render with toggle ON
  const htmlOn = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: packagesData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: true,
    }),
  )

  // With toggle on, test-pkg is included (7 + 1 = 8 packages with issues)
  assert.ok(htmlOn.includes('test-pkg'), 'test-pkg is visible when toggle is ON')
  assert.ok(htmlOn.includes('Show all 8 packages'), 'Show all 8 packages rendered when toggle is ON')
  assert.equal(htmlOn.includes('in tests/fixtures'), false, 'Suffix hidden when toggle is ON')
})

test('CodeMapPanel: Inspecting a file - summary line, compact stat row, 5-cap, folders collapsed, tests block', () => {
  const nodes = [
    { id: 0, path: 'src/core.js', lang: 'javascript', category: 'production' },
    // 7 direct importers (6 source, 1 test)
    { id: 1, path: 'src/d1.js', lang: 'javascript', category: 'production' },
    { id: 2, path: 'src/d2.js', lang: 'javascript', category: 'production' },
    { id: 3, path: 'src/d3.js', lang: 'javascript', category: 'production' },
    { id: 4, path: 'src/d4.js', lang: 'javascript', category: 'production' },
    { id: 5, path: 'src/d5.js', lang: 'javascript', category: 'production' },
    { id: 6, path: 'src/d6.js', lang: 'javascript', category: 'production' },
    { id: 7, path: 'tests/d7.test.js', lang: 'javascript', category: 'non-production' },
    // Transitive files across 7 different folders (plus 7 files in folder1 to test folder file cap)
    { id: 10, path: 'folder1/f1.js', lang: 'javascript', category: 'production' },
    { id: 11, path: 'folder1/f2.js', lang: 'javascript', category: 'production' },
    { id: 12, path: 'folder1/f3.js', lang: 'javascript', category: 'production' },
    { id: 13, path: 'folder1/f4.js', lang: 'javascript', category: 'production' },
    { id: 14, path: 'folder1/f5.js', lang: 'javascript', category: 'production' },
    { id: 15, path: 'folder1/f6.js', lang: 'javascript', category: 'production' },
    { id: 16, path: 'folder1/f7.js', lang: 'javascript', category: 'production' },
    { id: 20, path: 'folder2/f1.js', lang: 'javascript', category: 'production' },
    { id: 30, path: 'folder3/f1.js', lang: 'javascript', category: 'production' },
    { id: 40, path: 'folder4/f1.js', lang: 'javascript', category: 'production' },
    { id: 50, path: 'folder5/f1.js', lang: 'javascript', category: 'production' },
    { id: 60, path: 'folder6/f1.js', lang: 'javascript', category: 'production' },
    { id: 70, path: 'folder7/f1.js', lang: 'javascript', category: 'production' },
    // Root level transitive files to test "./" labeled as "project root"
    { id: 90, path: 'root_impact1.js', lang: 'javascript', category: 'production' },
    { id: 91, path: 'root_impact2.js', lang: 'javascript', category: 'production' },
    // Transitive test files
    { id: 80, path: 'tests/trans1.test.js', lang: 'javascript', category: 'non-production' },
    { id: 81, path: 'tests/trans2.test.js', lang: 'javascript', category: 'non-production' },
  ]

  const edges = [
    // Direct: 1..7 import 0
    [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0],
    // Transitive: folder1..7, root_impact, and tests import 1
    [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1],
    [20, 1], [30, 1], [40, 1], [50, 1], [60, 1], [70, 1],
    [90, 1], [91, 1],
    [80, 1], [81, 1],
  ]

  const impactData = {
    coverage: { graphFiles: nodes.length, totalFiles: nodes.length, analyzedFiles: nodes.length },
    inventory: { totalFiles: nodes.length, analyzedFiles: nodes.length, byLanguage: { javascript: nodes.length } },
    graph: { nodes, edges, externals: [] },
    summary: {
      entryPoints: [],
      cycles: [],
      orphans: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
    },
  }

  // 1. Render inspecting src/core.js with toggle OFF
  const htmlOff = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: impactData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: false,
    }),
  )

  // Summary line
  assert.ok(htmlOff.includes('can affect') || htmlOff.includes('compact-stat-row'), 'Summary line present')

  // Compact stat row (direct source, direct tests, transitive source, transitive tests)
  assert.ok(htmlOff.includes('class="compact-stat-row"'), 'Compact stat row rendered')
  assert.ok(htmlOff.includes('Direct source</span>') && htmlOff.includes('Direct tests</span>'), 'Compact stat labels rendered')
  assert.ok(htmlOff.includes('Transitive source</span>') && htmlOff.includes('Transitive tests</span>'), 'Transitive stat labels rendered')

  // Directly affected shows first 5, then "Show all 7"
  assert.ok(htmlOff.includes('Show all 7'), 'Show all 7 rendered for directly affected files')

  // Transitively affected by folder:
  // 8 folders exist -> 5 largest folders shown initially, then "Show all 8 folders"
  assert.ok(htmlOff.includes('Show all 8 folders'), 'Show all 8 folders rendered')

  // All folders are <details> and collapsed by default (no open attribute on folder details)
  assert.ok(htmlOff.includes('class="transitive-folder-details"'), 'Transitive folder details rendered')
  assert.equal(htmlOff.includes('class="transitive-folder-details" open'), false, 'Folders are collapsed by default')

  // Each folder summary shows only its count
  assert.ok(htmlOff.includes('folder1/</span>') && htmlOff.includes('class="count-badge">7</strong>'), 'folder1/ shows only its count 7 in summary')

  // Root folder is labeled "project root" instead of "./"
  assert.ok(htmlOff.includes('project root</span>'), 'Root folder ./ is labeled "project root"')
  assert.equal(htmlOff.includes('<span class="folder-name">./</span>'), false, './ is not displayed as a folder label')

  // Inside folder1 (7 files): shows first 5, then "Show all 7"
  assert.ok(htmlOff.includes('Show all 7'), 'Files inside folder capped at 5 with Show all 7')

  // With toggle off, Tests block is hidden
  assert.equal(htmlOff.includes('transitive-tests-group'), false, 'Tests group hidden when toggle is OFF')

  // Expand all / Collapse all controls for folders exist
  assert.ok(htmlOff.includes('Expand all'), 'Expand all present')
  assert.ok(htmlOff.includes('Collapse all'), 'Collapse all present')

  // 2. Render with toggle ON
  const htmlOn = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: impactData,
      status: 'success',
      onRerun: () => {},
      initialIncludeNonProd: true,
    }),
  )

  // With toggle on, Tests block is rendered as its own collapsed block
  assert.ok(htmlOn.includes('transitive-tests-group'), 'Tests group rendered when toggle is ON')
  assert.ok(htmlOn.includes('Tests</span>') && htmlOn.includes('class="count-badge">2</strong>'), 'Tests group shows count 2')
  assert.equal(htmlOn.includes('class="transitive-folder-details transitive-tests-group" open'), false, 'Tests group is collapsed by default')
})

test('CodeMapPanel: disabled toggle and note when no non-production files exist', () => {
  const prodOnlyData = {
    coverage: { graphFiles: 2, totalFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2, byLanguage: { javascript: 2 } },
    graph: {
      nodes: [
        { id: 0, path: 'src/a.js', lang: 'javascript', category: 'production' },
        { id: 1, path: 'src/b.js', lang: 'javascript', category: 'production' },
      ],
      edges: [[0, 1]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/a.js'],
      cycles: [],
      orphans: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
      declaredButUnused: [],
      usedButUndeclared: [],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: prodOnlyData,
      status: 'success',
      onRerun: () => {},
    }),
  )

  // Toggle is disabled and note is shown
  assert.ok(html.includes('No test files found in this project'), 'Note shown when no non-production files exist')
  assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Toggle checkbox is disabled')

  // When non-production files exist, note is NOT shown and toggle is not disabled
  const withNonProdData = {
    ...prodOnlyData,
    summary: {
      ...prodOnlyData.summary,
      nonProduction: { orphans: 1 },
    },
  }
  const htmlWithNonProd = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: withNonProdData,
      status: 'success',
      onRerun: () => {},
    }),
  )
  assert.equal(htmlWithNonProd.includes('No test files found in this project'), false, 'Note is omitted when non-production files exist')
})




