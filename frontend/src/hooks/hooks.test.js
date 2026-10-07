import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import React from 'react'
import { useProjects } from './useProjects.js'
import { useHistory } from './useHistory.js'
import { useBugVault } from './useBugVault.js'
import {
  BUG_VAULT_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
} from '../utils/storage.js'

function renderHook(hookFn) {
  const states = []
  let index = 0
  let result = null

  function render() {
    index = 0
    const prevDispatcher = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
      useState(initial) {
        const i = index++
        if (states.length <= i) {
          states[i] = typeof initial === 'function' ? initial() : initial
        }
        const setState = (action) => {
          states[i] = typeof action === 'function' ? action(states[i]) : action
          render()
        }
        return [states[i], setState]
      },
      useCallback(fn) {
        return fn
      },
      useMemo(fn) {
        return fn()
      },
      useContext() {
        return null
      },
      useEffect() {},
      useRef(initial) {
        return { current: initial }
      },
    }

    try {
      result = hookFn()
    } finally {
      React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = prevDispatcher
    }
  }

  render()
  return {
    get current() {
      return result
    },
  }
}

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

let mockStorage

beforeEach(() => {
  mockStorage = createMockStorage()
  globalThis.localStorage = mockStorage
  globalThis.window = { localStorage: mockStorage }
})

test('useProjects: records project analysis and updates storage', () => {
  const hook = renderHook(() => useProjects())
  assert.equal(hook.current.projects.length, 0)

  // Record analysis for a new project
  hook.current.recordProjectAnalysis({ fullName: 'owner/repo1' }, { score: 95, status: 'Healthy' })
  assert.equal(hook.current.projects.length, 1)
  assert.equal(hook.current.projects[0].repository.fullName, 'owner/repo1')
  assert.equal(hook.current.projects[0].analysisCount, 1)
  assert.equal(hook.current.projects[0].health.score, 95)

  // Re-record analysis for the same project
  hook.current.recordProjectAnalysis({ fullName: 'owner/repo1' }, { score: 100, status: 'Healthy' })
  assert.equal(hook.current.projects.length, 1)
  assert.equal(hook.current.projects[0].analysisCount, 2)
  assert.equal(hook.current.projects[0].health.score, 100)

  // Verify storage was written
  const stored = JSON.parse(mockStorage.getItem(PROJECTS_STORAGE_KEY))
  assert.equal(stored.data.length, 1)
})

test('useHistory: records analysis history, calculates issues and successful setups', () => {
  const hook = renderHook(() => useHistory())
  assert.equal(hook.current.analysisHistory.length, 0)
  assert.equal(hook.current.issuesFound, 0)
  assert.equal(hook.current.successfulSetups, 0)

  // Add healthy analysis
  hook.current.addAnalysisEntry(
    { fullName: 'owner/healthy-repo' },
    { score: 95, status: 'Healthy' },
    { total: 5, pass: 5, warning: 0, error: 0 },
    [],
  )

  assert.equal(hook.current.analysisHistory.length, 1)
  assert.equal(hook.current.successfulSetups, 1)
  assert.equal(hook.current.issuesFound, 0)

  // Add unhealthy analysis with issues
  hook.current.addAnalysisEntry(
    { fullName: 'owner/troubled-repo' },
    { score: 60, status: 'Critical' },
    { total: 5, pass: 2, warning: 2, error: 1 },
    [],
  )

  assert.equal(hook.current.analysisHistory.length, 2)
  assert.equal(hook.current.successfulSetups, 1)
  assert.equal(hook.current.issuesFound, 3)

  // Select analysis
  hook.current.selectAnalysis(hook.current.analysisHistory[0])
  assert.equal(hook.current.selectedAnalysis.repository.fullName, 'owner/troubled-repo')

  // Verify storage was written
  const stored = JSON.parse(mockStorage.getItem(HISTORY_STORAGE_KEY))
  assert.equal(stored.data.length, 2)
})

test('useHistory: caps history entries at 5', () => {
  const hook = renderHook(() => useHistory())

  for (let i = 1; i <= 7; i++) {
    hook.current.addAnalysisEntry(
      { fullName: `owner/repo-${i}` },
      { score: 80, status: 'Needs Attention' },
      null,
      [],
    )
  }

  assert.equal(hook.current.analysisHistory.length, 5)
  assert.equal(hook.current.analysisHistory[0].repository.fullName, 'owner/repo-7')
})

test('useBugVault: saves, updates, deletes bugs and creates custom categories', () => {
  const hook = renderHook(() => useBugVault())
  assert.equal(hook.current.bugs.length, 0)

  // Save new bug
  const saved = hook.current.saveBug({
    problem: 'Missing dependency',
    error: 'Module not found',
    status: 'unresolved',
  })

  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].problem, 'Missing dependency')
  assert.equal(hook.current.bugs[0].status, 'unresolved')

  // Update existing bug
  hook.current.saveBug({
    ...saved,
    status: 'solved',
    verifiedSolution: 'npm install module',
  }, saved.id)

  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].status, 'solved')
  assert.equal(hook.current.bugs[0].verifiedSolution, 'npm install module')
  assert.ok(hook.current.bugs[0].updatedAt)

  // Create custom category
  const catResult = hook.current.createCategory('Docker')
  assert.equal(catResult.status, 'created')
  assert.ok(hook.current.customCategories.includes('Docker'))

  // Delete bug
  hook.current.deleteBug(saved.id)
  assert.equal(hook.current.bugs.length, 0)

  // Verify storage was updated
  const storedBugs = JSON.parse(mockStorage.getItem(BUG_VAULT_STORAGE_KEY))
  assert.equal(storedBugs.data.length, 0)
})

test('useBugVault: imports bug vault json payload and updates state', () => {
  const hook = renderHook(() => useBugVault())

  const importPayload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    bugs: [
      {
        id: 101,
        problem: 'Imported problem',
        status: 'unresolved',
        createdAt: new Date().toISOString(),
      },
    ],
    categories: ['CustomCategory'],
  })

  const result = hook.current.importVault(importPayload)
  assert.equal(result.success, true)
  assert.equal(result.imported, 1)
  assert.equal(result.skipped, 0)
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].problem, 'Imported problem')
  assert.ok(hook.current.transferMessage.includes('Imported 1'))
})
