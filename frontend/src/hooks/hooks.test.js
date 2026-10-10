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

test('useHistory: stores and persists meta (framework, monorepo, stack) with backward compatibility', () => {
  const hook = renderHook(() => useHistory())

  // Add analysis with metadata
  hook.current.addAnalysisEntry(
    { fullName: 'owner/modern-app' },
    { score: 92, status: 'Healthy' },
    { total: 10, pass: 9, warning: 1, error: 0 },
    [{ rule: 'pkg', status: 'pass' }],
    {
      framework: 'Next.js',
      monorepo: true,
      stack: [{ name: 'React', detected: true }, { name: 'TypeScript', detected: true }],
    },
  )

  assert.equal(hook.current.analysisHistory[0].framework, 'Next.js')
  assert.equal(hook.current.analysisHistory[0].monorepo, true)
  assert.equal(hook.current.analysisHistory[0].stack.length, 2)

  // Verify stored shape
  const stored = JSON.parse(mockStorage.getItem(HISTORY_STORAGE_KEY))
  assert.equal(stored.data[0].framework, 'Next.js')
  assert.equal(stored.data[0].monorepo, true)
  assert.deepEqual(stored.data[0].stack, [
    { name: 'React', detected: true },
    { name: 'TypeScript', detected: true },
  ])

  // Backward compatibility: add entry without meta
  hook.current.addAnalysisEntry(
    { fullName: 'owner/legacy-app' },
    { score: 70, status: 'Needs Attention' },
  )

  assert.equal(hook.current.analysisHistory[0].framework, null)
  assert.equal(hook.current.analysisHistory[0].monorepo, false)
  assert.deepEqual(hook.current.analysisHistory[0].stack, [])
})

test('useHistory: successfulSetups counts unique projects whose latest analysis is >= 90', () => {
  const hook = renderHook(() => useHistory())

  // First analysis for repo1: score 95 (successful)
  hook.current.addAnalysisEntry(
    { fullName: 'owner/repo1' },
    { score: 95, status: 'Healthy' },
    null,
    [],
  )
  assert.equal(hook.current.successfulSetups, 1)

  // Second analysis for repo1: score 98 (still successful, but must count once, not twice)
  hook.current.addAnalysisEntry(
    { fullName: 'owner/repo1' },
    { score: 98, status: 'Healthy' },
    null,
    [],
  )
  assert.equal(hook.current.successfulSetups, 1)

  // First analysis for repo2: score 92 (successful, now 2 unique projects)
  hook.current.addAnalysisEntry(
    { fullName: 'owner/repo2' },
    { score: 92, status: 'Healthy' },
    null,
    [],
  )
  assert.equal(hook.current.successfulSetups, 2)

  // Third analysis for repo1: score drops to 70 (latest is now < 90, so repo1 is no longer successful)
  hook.current.addAnalysisEntry(
    { fullName: 'owner/repo1' },
    { score: 70, status: 'Needs Attention' },
    null,
    [],
  )
  assert.equal(hook.current.successfulSetups, 1)
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

  assert.equal(saved.success, true)
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].problem, 'Missing dependency')
  assert.equal(hook.current.bugs[0].status, 'unresolved')

  // Update existing bug
  const updated = hook.current.saveBug({
    ...saved,
    status: 'solved',
    verifiedSolution: 'npm install module',
  }, saved.id)

  assert.equal(updated.success, true)
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

test('useBugVault: saveBug reports failure and does not mutate state when storage fails on create', () => {
  const hook = renderHook(() => useBugVault())
  assert.equal(hook.current.bugs.length, 0)

  // Simulate storage failure (e.g. QuotaExceededError or setItem failure)
  mockStorage.setItem = () => {
    throw new Error('QuotaExceededError: storage is full')
  }

  const result = hook.current.saveBug({
    problem: 'Memory leak in worker',
    error: 'JavaScript heap out of memory',
    status: 'unresolved',
  })

  // Must report failure
  assert.equal(result.success, false)
  assert.equal(result.storageError, 'storage-failed')
  assert.equal(result.problem, 'Memory leak in worker')

  // State must NOT be updated with unsaved data
  assert.equal(hook.current.bugs.length, 0)
})

test('useBugVault: saveBug reports failure and preserves original state when storage fails on edit', () => {
  const hook = renderHook(() => useBugVault())

  // First save succeeds
  const initial = hook.current.saveBug({
    problem: 'Port collision',
    error: 'EADDRINUSE 3000',
    status: 'unresolved',
  })
  assert.equal(initial.success, true)
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].status, 'unresolved')

  // Simulate storage failure during edit
  mockStorage.setItem = () => {
    throw new Error('QuotaExceededError')
  }

  const editResult = hook.current.saveBug({
    ...initial,
    status: 'solved',
    verifiedSolution: 'kill -9 $(lsof -t -i:3000)',
  }, initial.id)

  // Must report failure
  assert.equal(editResult.success, false)
  assert.equal(editResult.storageError, 'storage-failed')

  // Original state must NOT be modified in memory
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].status, 'unresolved')
  assert.equal(hook.current.bugs[0].verifiedSolution, '')
})

test('useBugVault: saveBug maintains compatibility with legacy records and string IDs', () => {
  // Pre-seed storage with legacy bug that has string id and 'solution' instead of 'verifiedSolution'
  const legacyRecord = {
    id: 'legacy-bug-123',
    problem: 'Old Python issue',
    error: 'ModuleNotFoundError: No module named requests',
    solution: 'pip install requests',
    status: 'solved',
  }
  mockStorage.setItem(BUG_VAULT_STORAGE_KEY, JSON.stringify({
    version: 1,
    data: [legacyRecord],
  }))

  const hook = renderHook(() => useBugVault())
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].id, 'legacy-bug-123')

  // Edit using string ID
  const editResult = hook.current.saveBug({
    ...hook.current.bugs[0],
    verifiedSolution: 'pip install requests==2.31.0',
  }, 'legacy-bug-123')

  assert.equal(editResult.success, true)
  assert.equal(editResult.id, 'legacy-bug-123')
  assert.equal(hook.current.bugs.length, 1)
  assert.equal(hook.current.bugs[0].verifiedSolution, 'pip install requests==2.31.0')

  // Verify storage was updated with versioned envelope
  const stored = JSON.parse(mockStorage.getItem(BUG_VAULT_STORAGE_KEY))
  assert.equal(stored.data[0].id, 'legacy-bug-123')
  assert.equal(stored.data[0].verifiedSolution, 'pip install requests==2.31.0')
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
