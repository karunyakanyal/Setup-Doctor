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
  assert.ok(
    html.includes('Mapped connections for 4 code files; 8 other files inventoried only; 3 skipped.'),
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
  assert.ok(html.includes('Changing this file directly or transitively affects'))

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
  assert.ok(html.includes('Mapped connections for 25 code files; 15 other files inventoried only; 0 skipped.'))
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
  assert.ok(html.includes('Changing this file directly or transitively affects 1 files'))
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

  // Header format: "Mapped connections for N code files; M other files inventoried only; K skipped."
  assert.ok(html.includes('Mapped connections for 45 code files; 32 other files inventoried only; 1 skipped.'))

  // 3: Banner does NOT repeat the "Mapped connections for ..." sentence
  const bannerMatch = html.match(/<div class="codemap-approximate-notice"[^>]*>([\s\S]*?)<\/div>/)
  assert.ok(bannerMatch)
  assert.equal(bannerMatch[1].includes('Mapped connections for'), false)
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
  assert.ok(html.includes('Mapped connections for 45 code files; 32 other files inventoried only; 3 skipped.'))
  assert.ok(html.includes('Python: 20 files, not mapped, Other: 12 files, not mapped'))
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

  // In By Language: javascript, python, json (3 languages), Binary, Other
  // Languages card must be 3
  const langCardMatch = html.match(/<span class="codemap-card-label">Languages<\/span>\s*<strong class="codemap-card-value">(\d+)<\/strong>/)
  assert.ok(langCardMatch)
  assert.equal(langCardMatch[1], '3')

  // Count items listed in By Language list that are not Binary and not Other
  const byLangSectionMatch = html.match(/<h5>By Language<\/h5>\s*<ul class="codemap-simple-list">([\s\S]*?)<\/ul>/)
  assert.ok(byLangSectionMatch)
  const items = [...byLangSectionMatch[1].matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1])
  const languagesListed = items.filter(label => label !== 'Binary' && label !== 'Other')
  assert.equal(languagesListed.length, 3)
  assert.equal(Number(langCardMatch[1]), languagesListed.length, 'Languages card must equal the number of languages listed')
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

  const cardMatch = html.match(/<div class="codemap-card">\s*<span class="codemap-card-label">Unresolved Imports<\/span>\s*<strong class="codemap-card-value">none<\/strong>\s*<\/div>/)
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


