import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '../..')

let viteServer
let CodeMapPanel
let DiagnosticCard
let ProjectGlanceCard
let WhatToDoNextPanel

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const cmpMod = await viteServer.ssrLoadModule('./src/components/codemap/CodeMapPanel.jsx')
  CodeMapPanel = cmpMod.default

  const diagMod = await viteServer.ssrLoadModule('./src/components/diagnostics/DiagnosticCard.jsx')
  DiagnosticCard = diagMod.default

  const glanceMod = await viteServer.ssrLoadModule('./src/components/diagnostics/ProjectGlanceCard.jsx')
  ProjectGlanceCard = glanceMod.default

  const nextMod = await viteServer.ssrLoadModule('./src/components/diagnostics/WhatToDoNextPanel.jsx')
  WhatToDoNextPanel = nextMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('CodeMapPanel: renders friendly zero states with meaning lines for cycles, orphans, and undeclared deps', () => {
  const cleanData = {
    coverage: { totalFiles: 2, graphFiles: 2, analyzedFiles: 2 },
    inventory: { totalFiles: 2, analyzedFiles: 2 },
    graph: {
      nodes: [
        { id: 0, path: 'src/main.js', lang: 'javascript', size: 100, loc: 10, fanIn: 0, fanOut: 1, isEntry: true, isOrphan: false },
        { id: 1, path: 'src/util.js', lang: 'javascript', size: 100, loc: 10, fanIn: 1, fanOut: 0, isEntry: false, isOrphan: false },
      ],
      edges: [[0, 1]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/main.js'],
      cycles: [],
      orphans: [],
      hotspots: { byFanIn: [], byTransitiveImpact: [] },
      declaredButUnused: [],
      usedButUndeclared: [],
      unresolvedCount: 0,
      unresolved: [],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: cleanData,
      status: 'success',
      onRerun: () => {},
    })
  )

  // 1. Cycles zero state
  assert.ok(html.includes('No circular dependencies. Good.'))
  assert.ok(html.includes('Your module graph has no recursive dependency loops'))

  // 2. Orphans zero state
  assert.ok(html.includes('No orphan files. Good.'))
  assert.ok(html.includes('Every code file is imported by at least one other file or serves as an entry point.'))

  // 3. Undeclared packages zero state
  assert.ok(html.includes('No undeclared packages. Good.'))
  assert.ok(html.includes('All external packages imported in your source code are properly declared in package.json.'))

  // 4. "How reliable is this?" card
  assert.ok(html.includes('How reliable is this?'))
  assert.ok(html.includes('static code analysis'))
  assert.ok(html.includes('cannot detect dynamic runtime imports'))
})

test('CodeMapPanel: renders unresolved imports friendly zero state with meaning line', () => {
  const data = {
    coverage: { totalFiles: 1, graphFiles: 1 },
    inventory: { totalFiles: 1, analyzedFiles: 1 },
    graph: { nodes: [{ id: 0, path: 'src/index.js', isEntry: true }], edges: [], externals: [] },
    summary: { entryPoints: ['src/index.js'], cycles: [], orphans: [], unresolved: [], unresolvedCount: 0 },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data,
      status: 'success',
      initialShowUnresolvedPanel: true,
      onRerun: () => {},
    })
  )

  assert.ok(html.includes('No unresolved imports. Good.'))
  assert.ok(html.includes('All module specifiers and package paths resolve to valid files and dependencies.'))
})

test('CodeMapPanel: short loop first with fallback hint and full path collapsed by default', () => {
  const cycleData = {
    coverage: { totalFiles: 3, graphFiles: 3 },
    inventory: { totalFiles: 3, analyzedFiles: 3 },
    graph: {
      nodes: [
        { id: 0, path: 'src/a.ts', isEntry: true },
        { id: 1, path: 'src/b.ts', isEntry: false },
        { id: 2, path: 'src/c.ts', isEntry: false },
      ],
      edges: [[0, 1], [1, 2], [2, 0]],
      externals: [],
    },
    summary: {
      entryPoints: ['src/a.ts'],
      cycles: [
        {
          shortest: ['src/a.ts', 'src/b.ts'],
          files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
          // Missing hint -> should trigger fallback
        },
      ],
      orphans: [],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(CodeMapPanel, {
      data: cycleData,
      status: 'success',
      onRerun: () => {},
    })
  )

  // Short loop first
  assert.ok(html.includes('src/a.ts → src/b.ts → src/a.ts'))
  // Fallback hint
  assert.ok(html.includes('These files import each other. Move what they share into a third file.'))
  // Full path collapsed under "Show full path (3 files)"
  assert.ok(html.includes('Show full path (3 files)'))
  assert.ok(!html.includes('class="codemap-cycle-path-details" open'))
})

test('DiagnosticCard: renders three parts (What we found / Why it matters / How to fix it) and severity badge in words', () => {
  const errorDiag = {
    rule: 'no-lockfile',
    title: 'Missing package lockfile',
    message: 'No package-lock.json or yarn.lock was detected in the project root.',
    why: 'A lockfile guarantees reproducible dependency installations across all machines.',
    status: 'error',
    category: 'Dependencies',
    priority: 'High',
    fix: {
      type: 'command',
      description: 'Run npm install to generate a lockfile.',
      content: 'npm install --package-lock-only',
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(DiagnosticCard, {
      diagnostic: errorDiag,
    })
  )

  // Severity badge in words
  assert.ok(html.includes('Critical'), 'Severity badge displays "Critical" for error status')

  // Three parts
  assert.ok(html.includes('What we found'))
  assert.ok(html.includes('No package-lock.json or yarn.lock was detected in the project root.'))

  assert.ok(html.includes('Why it matters'))
  assert.ok(html.includes('A lockfile guarantees reproducible dependency installations across all machines.'))

  assert.ok(html.includes('How to fix it'))
  assert.ok(html.includes('npm install --package-lock-only'))

  // Warning diagnostic has "Important" badge
  const warningDiag = {
    rule: 'warn-rule',
    message: 'Warning text',
    status: 'warning',
    category: 'Configuration',
  }
  const warnHtml = renderToStaticMarkup(
    React.createElement(DiagnosticCard, { diagnostic: warningDiag })
  )
  assert.ok(warnHtml.includes('Important'), 'Severity badge displays "Important" for warning status')
})

test('ProjectGlanceCard: renders project name, stack in plain words, file count, and health verdict with icon + text + tone', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProjectGlanceCard, {
      repository: { fullName: 'facebook/react', language: 'JavaScript' },
      health: { score: 95 },
      framework: 'React',
      stack: ['Vite', 'React'],
      diagnostics: [{ status: 'pass' }],
      deepScanData: {
        coverage: { graphFiles: 142 },
        summary: { cycles: [], usedButUndeclared: [] },
      },
    })
  )

  assert.ok(html.includes('facebook/react'))
  assert.ok(html.includes('A React app built with Vite, written in JavaScript'))
  assert.ok(html.includes('142'))
  assert.ok(html.includes('code files mapped'))
  assert.ok(html.includes('Looking healthy'))
  assert.ok(html.includes('verdict-healthy'))
  assert.ok(html.includes('✓'))
})

test('WhatToDoNextPanel: displays max 3 recommendations ordered by severity with concrete actions and expansion control', () => {
  const diagnostics = [
    { rule: 'rule-1', message: 'Issue 1', status: 'error', fix: { type: 'command', content: 'cmd-1' } },
    { rule: 'rule-2', message: 'Issue 2', status: 'error', fix: { type: 'command', content: 'cmd-2' } },
    { rule: 'rule-3', message: 'Issue 3', status: 'warning', fix: { type: 'command', content: 'cmd-3' } },
    { rule: 'rule-4', message: 'Issue 4', status: 'warning', fix: { type: 'command', content: 'cmd-4' } },
  ]

  const html = renderToStaticMarkup(
    React.createElement(WhatToDoNextPanel, {
      diagnostics,
      deepScanData: null,
    })
  )

  // By default, displays only first 3 recommendations
  assert.ok(html.includes('cmd-1'))
  assert.ok(html.includes('cmd-2'))
  assert.ok(html.includes('cmd-3'))
  assert.ok(!html.includes('cmd-4'))

  // Has "Show all 4 recommendations" button
  assert.ok(html.includes('Show all 4 recommendations'))
})

test('DashboardView: Simple mode defaults and Technical details structure', () => {
  const dashboardPath = path.resolve(frontendRoot, 'src/views/DashboardView.jsx')
  const code = fs.readFileSync(dashboardPath, 'utf8')

  // 1. viewMode state defaults to 'simple'
  assert.match(code, /useState\(['"]simple['"]\)/, 'viewMode state must default to simple')

  // 2. Simple / Detailed toggle buttons with accessible attributes
  assert.ok(code.includes('className="view-mode-toggle"'), 'View mode toggle container present')
  assert.ok(code.includes("aria-pressed={viewMode === 'simple'}"), 'Simple button has aria-pressed bound to viewMode === simple')
  assert.ok(code.includes("aria-pressed={viewMode === 'detailed'}"), 'Detailed button has aria-pressed bound to viewMode === detailed')

  // 3. ProjectGlanceCard and WhatToDoNextPanel are rendered
  assert.ok(code.includes('<ProjectGlanceCard'), 'DashboardView renders ProjectGlanceCard')
  assert.ok(code.includes('<WhatToDoNextPanel'), 'DashboardView renders WhatToDoNextPanel')

  // 4. In simple mode, findings are capped at top 3 per category
  assert.ok(code.includes('group.items.slice(0, 3)'), 'Findings capped at top 3 per category in simple mode')
  assert.ok(code.includes('Showing {topItems.length} of {group.items.length}'), 'Shows count of displayed vs total checks')

  // 5. Technical details section wraps existing comprehensive breakdown
  assert.ok(code.includes('className="technical-details"'), 'Technical details section present')
  assert.ok(code.includes('className="technical-details-accordion"'), 'Technical details accordion present for simple mode')
  assert.ok(code.includes('<summary className="technical-details-summary">'), 'Technical details summary present')
  assert.ok(code.includes('<CodeMapPanel'), 'CodeMapPanel retained in technical details')
  assert.ok(code.includes('<DiagnosticsHealthSummary'), 'DiagnosticsHealthSummary retained in technical details')
  assert.ok(code.includes('<ScoreBreakdown'), 'ScoreBreakdown retained in technical details')
})

