import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getHealthVerdict } from './projectGlance.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('Phase 1: Rating tiles score is out of 100 ("96/100"), not "/10"', () => {
  const drtPath = path.resolve(__dirname, '../components/diagnostics/DimensionRatingTiles.jsx')
  const drtSource = fs.readFileSync(drtPath, 'utf8')

  assert.ok(drtSource.includes('{score}/100'), 'DimensionRatingTiles renders {score}/100')
  assert.ok(!drtSource.includes('{score}/10 score'), 'DimensionRatingTiles must not render {score}/10 score')
  assert.ok(!/\{score\}\/10\b/.test(drtSource), 'DimensionRatingTiles must not render {score}/10')
})

test('Phase 1: Technical details DiagnosticsHealthSummary shows overall grade/score and labels setup checks as "Setup checks: 90/100"', () => {
  const dhsPath = path.resolve(__dirname, '../components/diagnostics/DiagnosticsHealthSummary.jsx')
  const dhsSource = fs.readFileSync(dhsPath, 'utf8')

  assert.ok(dhsSource.includes('overallGrade'), 'DiagnosticsHealthSummary accepts overallGrade')
  assert.ok(dhsSource.includes('overallScore'), 'DiagnosticsHealthSummary accepts overallScore')
  assert.ok(dhsSource.includes('capReason'), 'DiagnosticsHealthSummary accepts capReason')
  assert.ok(dhsSource.includes('Setup checks: {setupChecksScore}/100'), 'DiagnosticsHealthSummary renders Setup checks: {setupChecksScore}/100')
  assert.ok(!dhsSource.includes('{label}'), 'DiagnosticsHealthSummary never displays old Healthy label')
})

test('Phase 1: DashboardView binds overall grade, score, and capReason everywhere', () => {
  const dvPath = path.resolve(__dirname, '../views/DashboardView.jsx')
  const dvSource = fs.readFileSync(dvPath, 'utf8')

  assert.ok(dvSource.includes('overallGrade'), 'DashboardView computes overallGrade')
  assert.ok(dvSource.includes('overallScore'), 'DashboardView computes overallScore')
  assert.ok(dvSource.includes('overallCapReason'), 'DashboardView computes overallCapReason')
  assert.ok(dvSource.includes('overallGrade={overallGrade}'), 'DashboardView passes overallGrade to DiagnosticsHealthSummary')
  assert.ok(dvSource.includes('overallScore={overallScore}'), 'DashboardView passes overallScore to DiagnosticsHealthSummary')
  assert.ok(dvSource.includes('capReason={overallCapReason}'), 'DashboardView passes capReason to DiagnosticsHealthSummary')
})

test('Phase 1: Verdict mapping across all grades (A, B, C, D, E)', () => {
  const vA = getHealthVerdict({ deepScanData: { grade: 'A', score: 95 } })
  assert.equal(vA.label, 'Looking healthy')
  assert.equal(vA.icon, '✓')
  assert.equal(vA.tone, 'healthy')

  const vB = getHealthVerdict({ deepScanData: { grade: 'B', score: 85 } })
  assert.equal(vB.label, 'A few things to fix')
  assert.equal(vB.icon, '⚠')
  assert.equal(vB.tone, 'warning')

  const vC = getHealthVerdict({ deepScanData: { grade: 'C', score: 75 } })
  assert.equal(vC.label, 'A few things to fix')
  assert.equal(vC.icon, '⚠')
  assert.equal(vC.tone, 'warning')

  const vD = getHealthVerdict({ deepScanData: { grade: 'D', score: 65 } })
  assert.equal(vD.label, 'Needs attention')
  assert.equal(vD.icon, '✖')
  assert.equal(vD.tone, 'attention')

  const vE = getHealthVerdict({ deepScanData: { grade: 'E', score: 55 } })
  assert.equal(vE.label, 'Needs attention')
  assert.equal(vE.icon, '✖')
  assert.equal(vE.tone, 'attention')
})
