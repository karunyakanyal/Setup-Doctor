import assert from 'node:assert/strict'
import test from 'node:test'
import { getWhatToDoNext } from './projectGlance.js'

test('Phase 5 Frontend: formatChanges correctly formats changes diff message', () => {
  function formatChanges(changes) {
    if (!changes || typeof changes !== 'object') return null
    const { newFindings, fixedFindings } = changes
    if (typeof newFindings !== 'number' && typeof fixedFindings !== 'number') return null
    return `${newFindings ?? 0} new, ${fixedFindings ?? 0} fixed since your last analysis`
  }

  assert.equal(formatChanges(null), null)
  assert.equal(formatChanges({}), null)
  assert.equal(
    formatChanges({ newFindings: 2, fixedFindings: 1 }),
    '2 new, 1 fixed since your last analysis'
  )
  assert.equal(
    formatChanges({ newFindings: 0, fixedFindings: 3 }),
    '0 new, 3 fixed since your last analysis'
  )
  assert.equal(
    formatChanges({ newFindings: 5 }),
    '5 new, 0 fixed since your last analysis'
  )
})

test('Phase 5 Frontend: getBadgeSnippet generates valid Markdown for README', () => {
  function getBadgeSnippet(owner, repo) {
    if (!owner || !repo) return null
    return `[![SetupDoctor Grade](https://img.shields.io/endpoint?url=https://setupdoctor.dev/api/badge/${owner}/${repo})](https://setupdoctor.dev)`
  }

  assert.equal(getBadgeSnippet(null, 'repo'), null)
  assert.equal(getBadgeSnippet('owner', null), null)
  assert.equal(
    getBadgeSnippet('vitejs', 'vite'),
    '[![SetupDoctor Grade](https://img.shields.io/endpoint?url=https://setupdoctor.dev/api/badge/vitejs/vite)](https://setupdoctor.dev)'
  )
})

test('Phase 5 Frontend: Project Profile card data parsing and normalization', () => {
  const profile = {
    stacks: ['node', 'express', 'react', 'vite'],
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'vitest run',
    },
    routes: [
      { method: 'GET', path: '/api/health', file: 'Backend/src/app.js', line: 15 },
      { method: 'POST', path: '/api/analyze', file: 'Backend/src/routes/analyze.js', line: 73 },
    ],
    envVars: ['PORT', 'GITHUB_TOKEN', 'NODE_ENV'],
    entryPoints: ['Backend/src/app.js', 'frontend/src/main.jsx'],
    nodeVersions: {
      nvmrc: 'v20.10.0',
      engines: '>=18.0.0',
      ci: '20.x',
    },
    ciProvider: 'GitHub Actions',
  }

  // Stacks
  assert.equal(profile.stacks.length, 4)
  assert.ok(profile.stacks.includes('express'))
  assert.ok(profile.stacks.includes('react'))

  // Scripts
  const scriptEntries = Object.entries(profile.scripts).map(([key, val]) => ({ name: key, command: String(val) }))
  assert.equal(scriptEntries.length, 3)
  assert.equal(scriptEntries[0].name, 'dev')
  assert.equal(scriptEntries[0].command, 'vite')

  // Routes
  assert.equal(profile.routes.length, 2)
  assert.equal(profile.routes[1].method, 'POST')
  assert.equal(profile.routes[1].line, 73)

  // Env vars & Node versions
  assert.equal(profile.envVars.length, 3)
  assert.equal(profile.nodeVersions.nvmrc, 'v20.10.0')
  assert.equal(profile.ciProvider, 'GitHub Actions')
})

test('Phase 5 Frontend: Dimension Rating tiles compute grade letters and 0-10 check scores', () => {
  const dimensions = {
    security: {
      grade: 'A',
      score: 100,
      reason: 'No security issues or committed secrets detected.',
      checks: [
        { id: 'committed-secrets', severity: 'critical', score: 10, count: 0 },
        { id: 'express-no-helmet', severity: 'important', score: 10, count: 0 },
      ],
    },
    reliability: {
      grade: 'B',
      score: 85,
      reason: 'Runtime Circular Dependency: 1 issue(s) detected.',
      checks: [
        { id: 'runtime-cycles', severity: 'critical', score: 3, count: 1 },
      ],
    },
    maintainability: {
      grade: 'C',
      score: 75,
      reason: 'Unused Production File: 2 issue(s) detected.',
      checks: [
        { id: 'orphans', severity: 'important', score: 5, count: 2 },
      ],
    },
    hygiene: {
      grade: 'B',
      score: 85,
      reason: 'Missing License: 1 issue(s) detected.',
      checks: [
        { id: 'missing-license', severity: 'nice-to-have', score: 8, count: 1 },
      ],
    },
    overallGrade: 'C',
    capReason: 'Maintainability: Unused Production File (orphans)',
  }

  assert.equal(dimensions.security.grade, 'A')
  assert.equal(dimensions.security.checks[0].score, 10)
  assert.equal(dimensions.reliability.grade, 'B')
  assert.equal(dimensions.maintainability.grade, 'C')
  assert.equal(dimensions.hygiene.grade, 'B')
  assert.equal(dimensions.overallGrade, 'C')
  assert.equal(dimensions.capReason, 'Maintainability: Unused Production File (orphans)')
})

test('Phase 5 Frontend: Findings sorting, severity bucketing and Simple vs Detailed mode', () => {
  const sampleFindings = [
    { id: 'unused-dependencies', severity: 'nice-to-have', count: 3, name: 'Unused Dependency' },
    { id: 'runtime-cycles', severity: 'critical', count: 1, name: 'Runtime Circular Dependency' },
    { id: 'orphans', severity: 'important', count: 2, name: 'Unused Production File' },
    { id: 'missing-tests', severity: 'important', count: 1, name: 'Missing Test Script' },
  ]

  const severityRank = { critical: 0, important: 1, 'nice-to-have': 2 }
  const sorted = [...sampleFindings].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  // Critical must come first
  assert.equal(sorted[0].id, 'runtime-cycles')
  assert.equal(sorted[0].severity, 'critical')

  // Important must follow
  assert.equal(sorted[1].severity, 'important')
  assert.equal(sorted[2].severity, 'important')

  // Nice-to-have last
  assert.equal(sorted[3].id, 'unused-dependencies')
  assert.equal(sorted[3].severity, 'nice-to-have')

  // Simple mode: top 3
  const simpleVisible = sorted.slice(0, 3)
  assert.equal(simpleVisible.length, 3)
  assert.equal(simpleVisible[0].id, 'runtime-cycles')
  assert.equal(simpleVisible[1].severity, 'important')
  assert.equal(simpleVisible[2].severity, 'important')

  // Detailed mode: all
  assert.equal(sorted.length, 4)
})

test('Phase 5 Frontend: Plain-words zero states in findings view', () => {
  const zeroStates = {
    critical: 'No critical reliability or security issues found. Good.',
    important: 'No important architectural or route validation issues found. Good.',
    niceToHave: 'Repository hygiene and code conventions look clean. Good.',
    secrets: 'No committed secrets found. Good.',
  }

  assert.equal(zeroStates.critical, 'No critical reliability or security issues found. Good.')
  assert.equal(zeroStates.important, 'No important architectural or route validation issues found. Good.')
  assert.equal(zeroStates.niceToHave, 'Repository hygiene and code conventions look clean. Good.')
  assert.equal(zeroStates.secrets, 'No committed secrets found. Good.')
})

test('Phase 5 Frontend: What to do next top 3 feeds from rule findings', () => {
  const findings = [
    {
      id: 'express-no-helmet',
      severity: 'important',
      count: 1,
      name: 'Missing Helmet Security Headers',
      why: 'Express app lacks helmet',
      fix: 'npm install helmet',
      evidence: [{ file: 'package.json' }],
    },
    {
      id: 'express-wildcard-cors',
      severity: 'important',
      count: 1,
      name: 'Wildcard CORS Origin Allowed',
      why: 'Wildcard cors',
      fix: 'Restrict origins',
      evidence: [{ file: 'Backend/src/app.js' }],
    },
    {
      id: 'missing-license',
      severity: 'nice-to-have',
      count: 1,
      name: 'Missing License',
      why: 'Missing license',
      fix: 'Add license',
      evidence: [{ file: 'package.json' }],
    },
  ]

  const actions = getWhatToDoNext({ deepScanData: { findings } })
  assert.ok(Array.isArray(actions))
  assert.ok(actions.length <= 3)
  assert.equal(actions[0].severity, 'Important')
  assert.equal(actions[0].action.value, 'package.json')
})
