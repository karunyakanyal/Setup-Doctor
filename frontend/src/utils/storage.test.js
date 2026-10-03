import assert from 'node:assert/strict'
import test from 'node:test'
import {
  safeLoad,
  safeSave,
  STORAGE_VERSION,
  BUG_VAULT_STORAGE_KEY,
  BUG_CATEGORIES_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
} from './storage.js'

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

test('storage: exports key constants', () => {
  assert.equal(typeof BUG_VAULT_STORAGE_KEY, 'string')
  assert.equal(typeof BUG_CATEGORIES_STORAGE_KEY, 'string')
  assert.equal(typeof HISTORY_STORAGE_KEY, 'string')
  assert.equal(typeof PROJECTS_STORAGE_KEY, 'string')
})

test('storage: returns fallback when key is missing or null', () => {
  const storage = createMockStorage()
  const fallback = [{ id: 1 }]
  const result = safeLoad('non-existent-key', fallback, Array.isArray, storage)
  assert.deepEqual(result, fallback)
})

test('storage: returns fallback on corrupt JSON without throwing', () => {
  const storage = createMockStorage({
    [BUG_VAULT_STORAGE_KEY]: '{"corrupted": json content...',
  })
  const fallback = []
  const result = safeLoad(BUG_VAULT_STORAGE_KEY, fallback, Array.isArray, storage)
  assert.deepEqual(result, fallback)
})

test('storage: returns fallback on invalid data shape when validate fails', () => {
  const storage = createMockStorage({
    [HISTORY_STORAGE_KEY]: JSON.stringify({ version: 1, data: { notAnArray: true } }),
  })
  const fallback = []
  const result = safeLoad(HISTORY_STORAGE_KEY, fallback, Array.isArray, storage)
  assert.deepEqual(result, fallback)
})

test('storage: safeSave stores versioned data and safeLoad reads it back', () => {
  const storage = createMockStorage()
  const projects = [{ id: 'p1', name: 'Repo1' }]

  const saved = safeSave(PROJECTS_STORAGE_KEY, projects, storage)
  assert.equal(saved, true)

  const rawStored = JSON.parse(storage.getItem(PROJECTS_STORAGE_KEY))
  assert.equal(rawStored.version, STORAGE_VERSION)
  assert.deepEqual(rawStored.data, projects)

  const loaded = safeLoad(PROJECTS_STORAGE_KEY, [], Array.isArray, storage)
  assert.deepEqual(loaded, projects)
})

test('storage: migrates older unversioned data on load', () => {
  const legacyBugs = [
    { id: 'b1', problem: 'Legacy bug 1', status: 'unresolved' },
    { id: 'b2', problem: 'Legacy bug 2', status: 'solved' },
  ]
  const storage = createMockStorage({
    [BUG_VAULT_STORAGE_KEY]: JSON.stringify(legacyBugs),
  })

  // Loading unversioned data should return the data AND migrate storage to { version: 1, data }
  const loaded = safeLoad(BUG_VAULT_STORAGE_KEY, [], Array.isArray, storage)
  assert.deepEqual(loaded, legacyBugs)

  // Verify storage was upgraded to version 1
  const updatedStored = JSON.parse(storage.getItem(BUG_VAULT_STORAGE_KEY))
  assert.equal(updatedStored.version, STORAGE_VERSION)
  assert.deepEqual(updatedStored.data, legacyBugs)
})

test('storage: safeLoad and safeSave never throw if storage access throws', () => {
  const brokenStorage = {
    getItem: () => {
      throw new Error('Storage quota or security error')
    },
    setItem: () => {
      throw new Error('Disk full')
    },
  }

  assert.doesNotThrow(() => {
    const loaded = safeLoad('any-key', 'fallback-val', null, brokenStorage)
    assert.equal(loaded, 'fallback-val')
  })

  assert.doesNotThrow(() => {
    const saved = safeSave('any-key', { data: 123 }, brokenStorage)
    assert.equal(saved, false)
  })
})
