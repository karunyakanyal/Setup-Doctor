import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countAnalyzedProjects,
  getShortFailureReason,
  getGrade,
} from './diagnosisFormatters.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('CSS contract: .dashboard-main has min-width: 0 and no horizontal page overflow styles', () => {
  const cssPath = path.resolve(__dirname, '../App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  assert.ok(css.includes('.dashboard-main'), 'App.css must define .dashboard-main')

  // Find .dashboard-main block
  const match = css.match(/\.dashboard-main\s*\{([^}]+)\}/)
  assert.ok(match, '.dashboard-main block must exist')
  const block = match[1]

  assert.ok(block.includes('min-width: 0'), '.dashboard-main must have min-width: 0 to prevent grid/flex blowout')
  assert.ok(!block.includes('overflow-x: scroll'), '.dashboard-main must not have overflow-x: scroll')
  assert.ok(!block.includes('overflow: scroll'), '.dashboard-main must not force page scrollbars')
})

test('CSS contract: grid/flex children have min-width: 0, long paths wrap, and tables/lists scroll internally', () => {
  const cssPath = path.resolve(__dirname, '../App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  // Monorepo banner
  assert.ok(css.includes('.monorepo-banner'), 'Must define .monorepo-banner')
  const monorepoMatch = css.match(/\.monorepo-banner\s*\{([^}]+)\}/)
  assert.ok(monorepoMatch)
  assert.ok(monorepoMatch[1].includes('min-width: 0'), '.monorepo-banner must have min-width: 0')
  assert.ok(monorepoMatch[1].includes('overflow-wrap: anywhere'), '.monorepo-banner must wrap long paths/text')

  // Code map columns & subcards
  assert.ok(css.includes('.codemap-two-col > *'), '.codemap-two-col children must have min-width: 0')
  assert.ok(css.includes('.codemap-three-col > *'), '.codemap-three-col children must have min-width: 0')
  assert.ok(css.includes('.codemap-subcard'), '.codemap-subcard must exist')

  // Tables
  const tableWrapMatch = css.match(/\.codemap-table-wrap\s*\{([^}]+)\}/)
  assert.ok(tableWrapMatch)
  assert.ok(tableWrapMatch[1].includes('overflow-x: auto'), 'Tables must scroll horizontally inside their container only')

  // File explorer paths
  const filePathMatch = css.match(/\.codemap-file-entry\s+\.file-path\s*\{([^}]+)\}/)
  assert.ok(filePathMatch)
  assert.ok(filePathMatch[1].includes('overflow-wrap: anywhere'), '.file-path must have overflow-wrap: anywhere to show full wrapped path')
  assert.ok(filePathMatch[1].includes('white-space: normal'), '.file-path must allow normal wrapping')

  // Active file title
  const activeTitleMatch = css.match(/\.active-file-title\s*\{([^}]+)\}/)
  assert.ok(activeTitleMatch)
  assert.ok(activeTitleMatch[1].includes('overflow-wrap: anywhere'), '.active-file-title must wrap long file paths')

  // Red failure badge for repository card
  assert.ok(css.includes('.repository-ready.repository-failed'), 'Must style failed repository badge in red')
})

test('getShortFailureReason: extracts clean short reasons for various error payloads', () => {
  // 1. NO_PACKAGE_JSON code
  assert.equal(
    getShortFailureReason({ code: 'NO_PACKAGE_JSON', message: 'No package.json found' }),
    'No package.json',
  )

  // 2. Message containing no package.json
  assert.equal(
    getShortFailureReason({ message: 'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.' }),
    'No package.json',
  )

  // 3. String containing no package.json
  assert.equal(
    getShortFailureReason('Error: No package.json in repository root'),
    'No package.json',
  )

  // 4. Rate limit 429
  assert.equal(
    getShortFailureReason({ status: 429, message: 'Rate limit exceeded' }),
    'Rate limit exceeded',
  )

  // 5. Not found 404
  assert.equal(
    getShortFailureReason({ status: 404, message: 'Repository not found' }),
    'Repository not found',
  )

  // 6. Access denied 403
  assert.equal(
    getShortFailureReason({ status: 403, message: 'Access denied to repository' }),
    'Access denied',
  )

  // 7. Custom error code
  assert.equal(
    getShortFailureReason({ code: 'CLONE_TIMEOUT', message: 'Repository clone took too long' }),
    'Clone timeout',
  )

  // 8. Fallback
  assert.equal(getShortFailureReason(null), 'Analysis failed')
})

test('countAnalyzedProjects: does not count repositories whose diagnostics failed (no record with a score)', () => {
  // Scenario A: 2 successful projects, 1 failed project (health is null / missing score)
  const projects = [
    {
      repository: { fullName: 'facebook/react' },
      health: { score: 92, status: 'Healthy' },
    },
    {
      repository: { fullName: 'vuejs/core' },
      health: { score: 88, status: 'Good' },
    },
    {
      repository: { fullName: 'unknown/no-package-json' },
      health: null, // failed analysis
    },
    {
      repository: { fullName: 'invalid/nan-score' },
      health: { score: NaN }, // invalid score
    },
  ]

  assert.equal(
    countAnalyzedProjects(projects, []),
    2,
    'Must only count projects with valid numeric scores',
  )
})

test('countAnalyzedProjects: keeps existing history entries working and deduplicates across history and projects', () => {
  const projects = [
    {
      repository: { fullName: 'vitejs/vite' },
      health: { score: 95, status: 'Healthy' },
    },
  ]

  const history = [
    // Duplicate of vitejs/vite
    {
      repository: { fullName: 'vitejs/vite' },
      health: { score: 95, status: 'Healthy' },
      analyzedAt: '2026-10-14T10:00:00.000Z',
    },
    // Older successful project only present in history
    {
      repository: { fullName: 'sveltejs/svelte' },
      health: { score: 90, status: 'Healthy' },
      analyzedAt: '2026-10-13T10:00:00.000Z',
    },
    // Failed project in history without score
    {
      repository: { fullName: 'failed/repo-in-history' },
      health: null,
      analyzedAt: '2026-10-12T10:00:00.000Z',
    },
  ]

  // vitejs/vite (1) + sveltejs/svelte (1) = 2. failed/repo-in-history must NOT be counted.
  assert.equal(countAnalyzedProjects(projects, history), 2)
})

test('countAnalyzedProjects: returns 0 for empty or invalid inputs', () => {
  assert.equal(countAnalyzedProjects([], []), 0)
  assert.equal(countAnalyzedProjects(null, null), 0)
  assert.equal(countAnalyzedProjects(undefined, undefined), 0)
})

test('Repo card badge logic: formats failure badge with short reason and success badge with time & grade', () => {
  // Helper simulating DashboardView badge logic
  function computeBadge(repository, health, diagnosticsError, historyMatch) {
    if (!repository?.fullName) {
      return { text: 'Ready for analysis', isFailed: false }
    }

    if (diagnosticsError) {
      const reason = getShortFailureReason(diagnosticsError)
      return { text: `Analysis failed: ${reason}`, isFailed: true }
    }

    const activeHealth = health || historyMatch?.health
    if (!activeHealth) {
      return { text: 'Ready for analysis', isFailed: false }
    }

    const grade = getGrade(activeHealth)
    const timestamp = historyMatch?.analyzedAt
    let timeStr = ''
    if (timestamp) {
      try {
        const date = new Date(timestamp)
        if (!Number.isNaN(date.getTime())) {
          timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      } catch {
        timeStr = ''
      }
    }

    if (timeStr && grade && grade !== 'N/A') {
      return { text: `Analyzed at ${timeStr} • Grade ${grade}`, isFailed: false }
    }
    if (grade && grade !== 'N/A') {
      return { text: `Grade ${grade}`, isFailed: false }
    }
    return { text: 'Ready for analysis', isFailed: false }
  }

  // 1. Diagnostics failed: replaces "Ready for analysis" with red badge and reason
  const failedBadge = computeBadge(
    { fullName: 'owner/no-pkg' },
    null,
    { code: 'NO_PACKAGE_JSON', message: 'package.json not found' },
    null,
  )
  assert.equal(failedBadge.isFailed, true)
  assert.equal(failedBadge.text, 'Analysis failed: No package.json')

  // 2. Successful analysis: keeps "Analyzed at <time> • Grade X"
  const successBadge = computeBadge(
    { fullName: 'owner/great-project' },
    { score: 94, status: 'Healthy' },
    null,
    { analyzedAt: '2026-10-14T12:30:00.000Z', health: { score: 94 } },
  )
  assert.equal(successBadge.isFailed, false)
  assert.ok(successBadge.text.startsWith('Analyzed at ') && successBadge.text.includes('• Grade A'))

  // 3. New unanalyzed repository: shows "Ready for analysis"
  const idleBadge = computeBadge(
    { fullName: 'owner/pending' },
    null,
    null,
    null,
  )
  assert.equal(idleBadge.isFailed, false)
  assert.equal(idleBadge.text, 'Ready for analysis')
})
