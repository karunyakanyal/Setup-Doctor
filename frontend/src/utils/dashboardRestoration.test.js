import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveLatestAnalysis,
  extractAnalysisState,
  normalizeTechnologyStack,
} from './diagnosisFormatters.js'

test('normalizeTechnologyStack: maps detected frameworks into stack items', () => {
  // Test framework detection mapping
  const nextStack = normalizeTechnologyStack([], 'next')
  assert.deepEqual(nextStack, [{ name: 'Next.js', detected: true }])

  const vueStack = normalizeTechnologyStack([], 'vue')
  assert.deepEqual(vueStack, [{ name: 'Vue', detected: true }])

  const reactStack = normalizeTechnologyStack([], 'react')
  assert.deepEqual(reactStack, [{ name: 'React', detected: true }])

  const expressStack = normalizeTechnologyStack([], 'express')
  assert.deepEqual(expressStack, [{ name: 'Express', detected: true }])

  const viteStack = normalizeTechnologyStack([], 'vite')
  assert.deepEqual(viteStack, [{ name: 'Vite', detected: true }])

  // Custom or unknown framework name capitalized
  const svelteStack = normalizeTechnologyStack([], 'svelte')
  assert.deepEqual(svelteStack, [{ name: 'Svelte', detected: true }])
})

test('normalizeTechnologyStack: normalizes string arrays and backend object arrays without duplicates', () => {
  // Array of strings
  const stringStack = normalizeTechnologyStack(['React', 'TypeScript', 'Tailwind'])
  assert.deepEqual(stringStack, [
    { name: 'React', detected: true },
    { name: 'TypeScript', detected: true },
    { name: 'Tailwind', detected: true },
  ])

  // Backend stack objects with detected boolean
  const backendStack = [
    { name: 'React', detected: false },
    { name: 'Vite', detected: true },
    { name: 'Express', detected: false },
    { name: 'TypeScript', detected: true },
    { name: 'ESLint', detected: true },
  ]
  const normalized = normalizeTechnologyStack(backendStack, 'react')
  // React detected flag should be promoted to true because framework is 'react'
  const reactItem = normalized.find((t) => t.name.toLowerCase() === 'react')
  assert.ok(reactItem)
  assert.equal(reactItem.detected, true)

  const viteItem = normalized.find((t) => t.name.toLowerCase() === 'vite')
  assert.ok(viteItem)
  assert.equal(viteItem.detected, true)

  const expressItem = normalized.find((t) => t.name.toLowerCase() === 'express')
  assert.ok(expressItem)
  assert.equal(expressItem.detected, false)
})

test('normalizeTechnologyStack: handles legacy empty or missing inputs gracefully', () => {
  assert.deepEqual(normalizeTechnologyStack(null, null), [])
  assert.deepEqual(normalizeTechnologyStack(undefined, undefined), [])
  assert.deepEqual(normalizeTechnologyStack([], null), [])
  assert.deepEqual(normalizeTechnologyStack([], ''), [])
  assert.deepEqual(normalizeTechnologyStack([], 'node'), [])
})

test('extractAnalysisState: extracts complete analysis state with modern metadata', () => {
  const fullAnalysis = {
    repository: {
      fullName: 'skinveda/app',
      name: 'app',
      owner: 'skinveda',
      defaultBranch: 'main',
      language: 'JavaScript',
      stars: 42,
    },
    health: {
      score: 85,
      status: 'Good',
      grade: 'B',
      categoryScores: { config: 90, dependencies: 80 },
    },
    framework: 'React',
    monorepo: true,
    stack: [{ name: 'Vite', detected: true }],
    diagnostics: [
      { rule: 'node-engine', status: 'pass' },
      { rule: 'env-file', status: 'warning' },
    ],
  }

  const state = extractAnalysisState(fullAnalysis)
  assert.equal(state.repository.fullName, 'skinveda/app')
  assert.equal(state.health.score, 85)
  assert.equal(state.framework, 'React')
  assert.equal(state.monorepo, true)
  // React was mapped into the detected stack along with Vite
  assert.equal(state.stack.length, 2)
  assert.equal(state.stack[0].name, 'React')
  assert.equal(state.stack[0].detected, true)
  assert.equal(state.stack[1].name, 'Vite')
  assert.equal(state.stack[1].detected, true)
  assert.equal(state.diagnostics.length, 2)
})

test('resolveLatestAnalysis: returns null when history is empty and no selection', () => {
  assert.equal(resolveLatestAnalysis([], null), null)
  assert.equal(resolveLatestAnalysis(null, null), null)
  assert.equal(resolveLatestAnalysis(undefined, undefined), null)
})

test('resolveLatestAnalysis: returns selectedAnalysis when provided', () => {
  const selected = {
    repository: { fullName: 'owner/selected-repo', name: 'selected-repo' },
    health: { score: 95, status: 'Healthy' },
    diagnostics: [],
  }
  const history = [
    {
      repository: { fullName: 'owner/other-repo', name: 'other-repo' },
      health: { score: 80, status: 'Good' },
    },
  ]

  const result = resolveLatestAnalysis(history, selected)
  assert.deepEqual(result, selected)
  assert.equal(result.repository.fullName, 'owner/selected-repo')
})

test('resolveLatestAnalysis: falls back to latest history entry (analysisHistory[0]) when selectedAnalysis is null', () => {
  const latestEntry = {
    repository: { fullName: 'owner/latest-repo', name: 'latest-repo' },
    health: { score: 90, status: 'Healthy' },
    diagnostics: [{ rule: 'scripts', status: 'pass' }],
  }
  const olderEntry = {
    repository: { fullName: 'owner/older-repo', name: 'older-repo' },
    health: { score: 70, status: 'Needs Attention' },
  }
  const history = [latestEntry, olderEntry]

  const result = resolveLatestAnalysis(history, null)
  assert.deepEqual(result, latestEntry)
  assert.equal(result.repository.fullName, 'owner/latest-repo')
})

test('resolveLatestAnalysis: handles invalid selectedAnalysis by falling back to history', () => {
  const latestEntry = {
    repository: { fullName: 'owner/valid-repo', name: 'valid-repo' },
    health: { score: 88, status: 'Good' },
  }
  const history = [latestEntry]

  // selectedAnalysis without repository or invalid shape
  assert.deepEqual(resolveLatestAnalysis(history, {}), latestEntry)
  assert.deepEqual(resolveLatestAnalysis(history, 'invalid-string'), latestEntry)
})

test('resolveLatestAnalysis: handles corrupt history entries safely', () => {
  assert.equal(resolveLatestAnalysis([null, undefined], null), null)
  assert.equal(resolveLatestAnalysis([{}], null), null)
  assert.equal(resolveLatestAnalysis(['not-an-object'], null), null)
})

test('extractAnalysisState: handles legacy analysis records missing optional fields without crashing', () => {
  // Legacy analysis from earlier versions: lacks framework, monorepo, stack, grade, categoryScores
  const legacyAnalysis = {
    repository: {
      fullName: 'skinveda/legacy',
      name: 'legacy',
      owner: 'skinveda',
      defaultBranch: 'main',
    },
    health: {
      score: 75,
      status: 'Needs Attention',
    },
    summary: { total: 4, pass: 3, warning: 1, error: 0 },
    diagnostics: [{ rule: 'package-json', status: 'pass' }],
    analyzedAt: '2026-10-09T12:00:00.000Z',
  }

  const state = extractAnalysisState(legacyAnalysis)
  assert.equal(state.repository.fullName, 'skinveda/legacy')
  assert.equal(state.health.score, 75)
  assert.equal(state.framework, null)
  assert.equal(state.monorepo, false)
  assert.deepEqual(state.stack, [])
  assert.equal(state.diagnostics.length, 1)
})

test('extractAnalysisState: returns safe empty defaults for null or invalid inputs', () => {
  const emptyState = {
    repository: null,
    diagnostics: [],
    health: null,
    framework: null,
    monorepo: false,
    stack: [],
  }

  assert.deepEqual(extractAnalysisState(null), emptyState)
  assert.deepEqual(extractAnalysisState(undefined), emptyState)
  assert.deepEqual(extractAnalysisState({}), emptyState)
  assert.deepEqual(extractAnalysisState('string'), emptyState)
})

test('Dashboard remount restoration: restores latest analysis when returning from other views', () => {
  // Simulates navigating away from Dashboard to Bug Vault and returning
  const storedHistory = [
    {
      repository: { fullName: 'Skinveda/Skinveda.ai', name: 'Skinveda.ai', owner: 'Skinveda' },
      health: { score: 92, status: 'Healthy', grade: 'A' },
      framework: 'Next.js',
      monorepo: false,
      stack: [{ name: 'React', detected: true }],
      diagnostics: [
        { ruleId: 'node-engine', status: 'pass', title: 'Node version specified' },
        { ruleId: 'env-files', status: 'pass', title: 'Env files secured' },
      ],
      analyzedAt: '2026-10-09T18:00:00.000Z',
    },
  ]

  // Dashboard remounts: selectedAnalysis is null, history has Skinveda.ai
  const resolved = resolveLatestAnalysis(storedHistory, null)
  assert.ok(resolved)
  assert.equal(resolved.repository.fullName, 'Skinveda/Skinveda.ai')

  const state = extractAnalysisState(resolved)
  assert.equal(state.repository.fullName, 'Skinveda/Skinveda.ai')
  assert.equal(state.health.score, 92)
  assert.equal(state.framework, 'Next.js')
  assert.equal(state.diagnostics.length, 2)
  // Stack should contain Next.js and React
  assert.equal(state.stack.length, 2)
  assert.equal(state.stack[0].name, 'Next.js')
  assert.equal(state.stack[1].name, 'React')
})

test('Stale-result prevention: switching between repositories replaces diagnostics cleanly', () => {
  const repoA = {
    repository: { fullName: 'org/repoA', name: 'repoA' },
    health: { score: 60, status: 'Needs Attention' },
    framework: 'Vue',
    monorepo: false,
    stack: [{ name: 'Vite', detected: true }],
    diagnostics: [{ rule: 'rule-a', status: 'error' }],
  }

  const repoB = {
    repository: { fullName: 'org/repoB', name: 'repoB' },
    health: { score: 95, status: 'Healthy' },
    framework: 'React',
    monorepo: true,
    stack: [{ name: 'Next.js', detected: true }],
    diagnostics: [{ rule: 'rule-b', status: 'pass' }],
  }

  // Active state for repoA
  const stateA = extractAnalysisState(repoA)
  assert.equal(stateA.repository.fullName, 'org/repoA')
  assert.equal(stateA.diagnostics[0].rule, 'rule-a')
  assert.equal(stateA.framework, 'Vue')
  assert.deepEqual(stateA.stack.map((s) => s.name), ['Vue', 'Vite'])

  // Switch to repoB
  const stateB = extractAnalysisState(repoB)
  assert.equal(stateB.repository.fullName, 'org/repoB')
  assert.equal(stateB.diagnostics[0].rule, 'rule-b')
  assert.equal(stateB.framework, 'React')
  assert.equal(stateB.monorepo, true)
  assert.deepEqual(stateB.stack.map((s) => s.name), ['React', 'Next.js'])

  // Verify no bleed-through of repoA into repoB
  assert.notEqual(stateB.diagnostics[0].rule, stateA.diagnostics[0].rule)
  assert.notEqual(stateB.framework, stateA.framework)
  assert.notDeepEqual(stateB.stack, stateA.stack)
})
