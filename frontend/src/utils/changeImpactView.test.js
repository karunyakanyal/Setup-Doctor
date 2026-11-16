import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendRoot = path.resolve(__dirname, '../..')

let viteServer
let ChangeImpactView

test.before(async () => {
  viteServer = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  const civMod = await viteServer.ssrLoadModule(
    './src/views/ChangeImpactView.jsx',
  )
  ChangeImpactView = civMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('Change Impact CSS contract: responsive at 360px, no horizontal overflow, and accessible styles', () => {
  const cssPath = path.resolve(__dirname, '../App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  assert.ok(css.includes('.change-impact-page'), 'App.css must define .change-impact-page')
  assert.ok(css.includes('.change-impact-form-card'), 'App.css must define .change-impact-form-card')
  assert.ok(css.includes('.impact-three-answers-grid'), 'App.css must define .impact-three-answers-grid')
  assert.ok(css.includes('.folder-blast-row'), 'App.css must define .folder-blast-row')
  assert.ok(css.includes('.folder-bar-track'), 'App.css must define .folder-bar-track')
  assert.ok(css.includes('.will-break-alert-box'), 'App.css must define .will-break-alert-box')

  // Check 360px responsive media query
  assert.ok(css.includes('@media (max-width: 600px)') || css.includes('@media (max-width: 640px)'), 'App.css must define responsive queries for mobile screens')
})

test('Change Impact View: initial render has form, mode tabs, inputs, and empty state', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/change-impact'] },
      React.createElement(ChangeImpactView),
    ),
  )

  assert.ok(html.includes('Change Impact Analysis'), 'Header title must render')
  assert.ok(html.includes('Pull Request'), 'Mode tab Pull Request must render')
  assert.ok(html.includes('Branch Comparison'), 'Mode tab Branch Comparison must render')
  assert.ok(html.includes('Analyze Change Impact'), 'Submit button must render')
  assert.ok(html.includes('Ready to analyze change impact'), 'Empty state must be visible initially')
})

test('Change Impact View: results with Low risk and plain-words zero state', () => {
  const mockImpact = {
    pullNumber: 42,
    prTitle: 'Fix typo in docs',
    repository: { owner: 'acme', repo: 'project' },
    risk: {
      level: 'Low',
      rule: 'Low: < 10% blast radius, 0 will-break findings, and 0 entry points reached.',
      reason: 'Low blast radius (<10%), 0 broken imports, and no entry points affected.',
    },
    changedFiles: {
      total: 1,
      mappedCount: 1,
      newOrUnmappedCount: 0,
      mapped: [{ path: 'docs/readme.md', status: 'modified' }],
      newOrUnmapped: [],
    },
    blastRadius: {
      totalCodeFiles: 50,
      affectedCount: 0,
      percentOfRepo: 0,
      byFolder: [],
    },
    unchangedButAffected: { count: 0, files: [] },
    willBreak: { count: 0, findings: [] },
    tests: { count: 0, files: [] },
    entryPointsReached: [],
    routesReached: [],
    markdownSummary: '### 🔍 Change Impact Analysis\n**Risk Level:** 🟢 Low\n',
  }

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/change-impact'] },
      React.createElement(ChangeImpactView, { initialImpactData: mockImpact }),
    ),
  )

  // Verdict and risk badge
  assert.ok(html.includes('Pull Request #42'))
  assert.ok(html.includes('Fix typo in docs'))
  assert.ok(html.includes('Low risk'))
  assert.ok(html.includes('Copy PR comment'))

  // Three plain answers
  assert.ok(html.includes('What changes'))
  assert.ok(html.includes('What else could break'))
  assert.ok(html.includes('What to test'))

  // Plain-words zero state
  assert.ok(html.includes('No unchanged file depends on this PR. Low risk.'))
  assert.ok(html.includes('No broken imports found.'))
  assert.ok(html.includes('No tests touch these files; test affected entry points and routes manually.'))

  // Markdown summary container
  assert.ok(html.includes('Ready-to-paste PR comment summary'))
  assert.ok(html.includes('### 🔍 Change Impact Analysis'))
})

test('Change Impact View: results with High risk, will-break findings, tests reached, and folder rows', () => {
  const mockImpact = {
    pullNumber: 15,
    prTitle: 'Refactor auth service',
    repository: { owner: 'karunyakanyal', repo: 'Setup-Doctor' },
    risk: {
      level: 'High',
      rule: 'High: any willBreakFindings, blast radius > 40%, or reaches both entry points and API routes.',
      reason: '1 will-break finding: removed/renamed files still imported by unchanged files.',
    },
    changedFiles: {
      total: 3,
      mappedCount: 2,
      newOrUnmappedCount: 1,
      mapped: [
        { path: 'src/services/oldAuth.js', status: 'removed' },
        { path: 'src/services/newAuth.js', status: 'added' },
      ],
      newOrUnmapped: [{ path: 'README.md', status: 'modified' }],
    },
    blastRadius: {
      totalCodeFiles: 20,
      affectedCount: 8,
      percentOfRepo: 40,
      byFolder: [
        { folder: 'src/services', affected: 5, total: 6, direct: 3, indirect: 2, unaffected: 1 },
        { folder: 'src/controllers', affected: 3, total: 4, direct: 1, indirect: 2, unaffected: 1 },
      ],
    },
    unchangedButAffected: { count: 6, files: ['src/controllers/user.js'] },
    willBreak: {
      count: 1,
      findings: [
        {
          file: 'src/services/oldAuth.js',
          status: 'removed',
          importer: 'src/controllers/user.js',
          line: 4,
          snippet: "import { auth } from '../services/oldAuth.js'",
        },
      ],
    },
    tests: { count: 2, files: ['test/auth.test.js', 'test/api.test.js'] },
    entryPointsReached: ['src/index.js'],
    routesReached: [{ method: 'POST', path: '/api/login' }],
    markdownSummary: '### 🔍 Change Impact Analysis\n**Risk Level:** 🔴 High\n',
  }

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/change-impact'] },
      React.createElement(ChangeImpactView, { initialImpactData: mockImpact }),
    ),
  )

  // High risk banner and reason
  assert.ok(html.includes('High risk'))
  assert.ok(html.includes('1 will-break finding'))

  // Will-break alert box
  assert.ok(html.includes('will-break-alert-box'))
  assert.ok(html.includes('src/services/oldAuth.js'))
  assert.ok(html.includes('src/controllers/user.js:4'))
  assert.ok(html.includes("import { auth } from &#x27;../services/oldAuth.js&#x27;") || html.includes("import { auth } from '../services/oldAuth.js'"))

  // Tests reached
  assert.ok(html.includes('test files reach these changes'))
  assert.ok(html.includes('<strong>2</strong>'))
  assert.ok(html.includes('test/auth.test.js'))

  // Entry points and routes
  assert.ok(html.includes('src/index.js'))
  assert.ok(html.includes('POST /api/login'))

  // Folder blast radius rows
  assert.ok(html.includes('src/services'))
  assert.ok(html.includes('5 of 6 files affected'))
  assert.ok(html.includes('src/controllers'))
  assert.ok(html.includes('3 of 4 files affected'))
})
