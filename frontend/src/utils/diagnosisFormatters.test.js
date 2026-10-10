import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateGradeFromScore,
  getGrade,
  getHealthLabel,
  getCategoryScore,
  categoryHasApplicableRules,
  sortDiagnostics,
  groupDiagnosticsByCategory,
  getFilterCounts,
  filterDiagnostics,
  getCopyableFix,
  calculateScoreBreakdown,
  normalizeStatus,
} from './diagnosisFormatters.js'

test('calculateGradeFromScore: adheres to verified grade boundaries', () => {
  assert.equal(calculateGradeFromScore(100), 'A')
  assert.equal(calculateGradeFromScore(90), 'A')
  assert.equal(calculateGradeFromScore(89), 'B')
  assert.equal(calculateGradeFromScore(80), 'B')
  assert.equal(calculateGradeFromScore(79), 'C')
  assert.equal(calculateGradeFromScore(70), 'C')
  assert.equal(calculateGradeFromScore(69), 'D')
  assert.equal(calculateGradeFromScore(60), 'D')
  assert.equal(calculateGradeFromScore(59), 'F')
  assert.equal(calculateGradeFromScore(0), 'F')
  assert.equal(calculateGradeFromScore(undefined), 'N/A')
  assert.equal(calculateGradeFromScore(null), 'N/A')
  assert.equal(calculateGradeFromScore(-5), 'N/A')
})

test('getGrade: prefers backend-provided grade and falls back safely to score calculation', () => {
  assert.equal(getGrade({ grade: 'B', score: 95 }), 'B') // Backend grade takes precedence
  assert.equal(getGrade({ score: 95 }), 'A') // Derived from score
  assert.equal(getGrade({ score: 72 }), 'C')
  assert.equal(getGrade(null), 'N/A')
  assert.equal(getGrade({}), 'N/A')
})

test('getHealthLabel: maps grade and status properly', () => {
  assert.equal(getHealthLabel({ label: 'Healthy' }), 'Healthy')
  assert.equal(getHealthLabel({ status: 'Good' }), 'Good')
  assert.equal(getHealthLabel({ score: 95 }), 'Healthy')
  assert.equal(getHealthLabel({ score: 85 }), 'Good')
  assert.equal(getHealthLabel({ score: 75 }), 'Needs Attention')
  assert.equal(getHealthLabel({ score: 65 }), 'At Risk')
  assert.equal(getHealthLabel({ score: 45 }), 'At Risk')
  assert.equal(getHealthLabel(null), 'Unknown')
})

test('category scores and N/A handling: returns null when no applicable rules', () => {
  const diagnostics = [
    { rule: 'node-engine', category: 'config', status: 'pass' },
    { rule: 'scripts', category: 'config', status: 'warning' },
  ]

  // Config category has applicable rules and score
  assert.equal(categoryHasApplicableRules('config', diagnostics), true)
  assert.equal(getCategoryScore('config', { config: 80 }, diagnostics), 80)

  // Security category has NO applicable rules, even if backend returns 100 or missing
  assert.equal(categoryHasApplicableRules('security', diagnostics), false)
  assert.equal(getCategoryScore('security', { security: 100 }, diagnostics), null) // Must return null for N/A
  assert.equal(getCategoryScore('security', {}, diagnostics), null)

  // Missing categoryScores object handled gracefully
  assert.equal(getCategoryScore('config', null, diagnostics), null)
})

test('normalizeStatus: normalizes all status variants', () => {
  assert.equal(normalizeStatus('fail'), 'error')
  assert.equal(normalizeStatus('error'), 'error')
  assert.equal(normalizeStatus('critical'), 'error')
  assert.equal(normalizeStatus('warn'), 'warning')
  assert.equal(normalizeStatus('warning'), 'warning')
  assert.equal(normalizeStatus('info'), 'info')
  assert.equal(normalizeStatus('pass'), 'pass')
  assert.equal(normalizeStatus(undefined), 'info')
})

test('sortDiagnostics: sorts by Error, Warning, Info, Pass order', () => {
  const diagnostics = [
    { title: 'Pass Check', status: 'pass' },
    { title: 'Warning Check', status: 'warning' },
    { title: 'Info Check', status: 'info' },
    { title: 'Error Check', status: 'error' },
  ]

  const sorted = sortDiagnostics(diagnostics)
  assert.deepEqual(
    sorted.map((d) => d.status),
    ['error', 'warning', 'info', 'pass'],
  )
})

test('groupDiagnosticsByCategory: groups by category and preserves severity order within groups', () => {
  const diagnostics = [
    { title: 'Config Pass', category: 'config', status: 'pass' },
    { title: 'Config Error', category: 'config', status: 'error' },
    { title: 'Testing Warning', category: 'testing', status: 'warn' },
  ]

  const groups = groupDiagnosticsByCategory(diagnostics)
  assert.equal(groups.length, 2)

  const configGroup = groups.find((g) => g.key === 'config')
  assert.ok(configGroup)
  assert.equal(configGroup.items[0].status, 'error')
  assert.equal(configGroup.items[1].status, 'pass')

  const testingGroup = groups.find((g) => g.key === 'testing')
  assert.ok(testingGroup)
  assert.equal(testingGroup.items[0].status, 'warn')
})

test('filterDiagnostics and getFilterCounts: filters accurately and calculates counts', () => {
  const diagnostics = [
    { title: 'E1', status: 'error' },
    { title: 'W1', status: 'warning' },
    { title: 'W2', status: 'warn' },
    { title: 'I1', status: 'info' },
    { title: 'P1', status: 'pass' },
    { title: 'P2', status: 'pass' },
  ]

  const counts = getFilterCounts(diagnostics)
  assert.deepEqual(counts, { all: 6, fail: 1, warn: 2, info: 1, pass: 2 })

  assert.equal(filterDiagnostics(diagnostics, 'all').length, 6)
  assert.equal(filterDiagnostics(diagnostics, 'fail').length, 1)
  assert.equal(filterDiagnostics(diagnostics, 'warn').length, 2)
  assert.equal(filterDiagnostics(diagnostics, 'info').length, 1)
  assert.equal(filterDiagnostics(diagnostics, 'pass').length, 2)
})

test('getCopyableFix: preserves distinction between command and snippet and never invents fixes', () => {
  // Command fix
  const commandFix = getCopyableFix({
    description: 'Install eslint',
    command: 'npm install --save-dev eslint',
  })
  assert.deepEqual(commandFix, {
    type: 'command',
    content: 'npm install --save-dev eslint',
    description: 'Install eslint',
  })

  // Snippet fix
  const snippetFix = getCopyableFix({
    description: 'Specify node engine',
    snippet: '"engines": { "node": ">=20.0.0" }',
  })
  assert.deepEqual(snippetFix, {
    type: 'snippet',
    content: '"engines": { "node": ">=20.0.0" }',
    description: 'Specify node engine',
  })

  // Description-only fix: no copyable command or snippet
  assert.equal(
    getCopyableFix({ description: 'Create a README file' }),
    null,
  )

  // Null, empty, or whitespace-only fix
  assert.equal(getCopyableFix(null), null)
  assert.equal(getCopyableFix({ command: '   ' }), null)
  assert.equal(getCopyableFix({ snippet: '' }), null)
})

test('calculateScoreBreakdown: accurately computes rule deductions and reconciles score', () => {
  // 10 scored checks: 1 error (10% deduction), 2 warnings (5% deduction each, total 10%)
  // Expected score: 100 - 20 = 80
  const diagnostics = [
    { rule: 'rule-1', status: 'error', title: 'Fatal error' },
    { rule: 'rule-2', status: 'warning', title: 'Warning 1' },
    { rule: 'rule-3', status: 'warn', title: 'Warning 2' },
    { rule: 'rule-4', status: 'pass', title: 'Pass 1' },
    { rule: 'rule-5', status: 'pass', title: 'Pass 2' },
    { rule: 'rule-6', status: 'pass', title: 'Pass 3' },
    { rule: 'rule-7', status: 'pass', title: 'Pass 4' },
    { rule: 'rule-8', status: 'pass', title: 'Pass 5' },
    { rule: 'rule-9', status: 'pass', title: 'Pass 6' },
    { rule: 'rule-10', status: 'pass', title: 'Pass 7' },
    { rule: 'dependency-count', status: 'info', title: 'Info check' }, // Should be excluded
  ]

  const breakdown = calculateScoreBreakdown(diagnostics, 80)
  assert.equal(breakdown.available, true)
  assert.equal(breakdown.totalScoredChecks, 10)
  assert.equal(breakdown.deductions.length, 3)

  // 100 / 10 = 10 pts for error
  assert.equal(breakdown.deductions[0].deduction, 10)
  // 50 / 10 = 5 pts for each warning
  assert.equal(breakdown.deductions[1].deduction, 5)
  assert.equal(breakdown.deductions[2].deduction, 5)

  assert.equal(breakdown.totalDeductions, 20)
  assert.equal(breakdown.calculatedScore, 80)
  assert.equal(breakdown.effectiveScore, 80)
  assert.equal(breakdown.reconciled, true)
})
