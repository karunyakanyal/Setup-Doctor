import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCustomCategory,
  BUG_CATEGORIES_STORAGE_KEY,
  loadCustomCategories,
  normalizeCategoryName,
  normalizeCustomCategories,
  saveCustomCategories,
} from './bugCategories.js'

test('normalizes category whitespace and preserves display spelling', () => {
  assert.equal(normalizeCategoryName('  Docker   Compose  '), 'Docker Compose')
  assert.deepEqual(
    normalizeCustomCategories(['  Docker   Compose  ', 'Other', 'docker compose']),
    ['Docker Compose'],
  )
})

test('selects an existing custom category instead of adding duplicates', () => {
  const byCase = addCustomCategory(['Docker'], 'docker')
  const byWhitespace = addCustomCategory(['Docker'], ' Docker ')

  assert.equal(byCase.status, 'exists')
  assert.equal(byCase.category, 'Docker')
  assert.deepEqual(byCase.categories, ['Docker'])
  assert.equal(byWhitespace.status, 'exists')
  assert.equal(byWhitespace.category, 'Docker')
})

test('rejects empty names and system-category collisions', () => {
  assert.equal(addCustomCategory([], '   ').status, 'empty')

  const collision = addCustomCategory(['Docker'], ' build ')
  assert.equal(collision.status, 'system-category')
  assert.equal(collision.category, 'Build')
  assert.deepEqual(collision.categories, ['Docker'])
})

test('creates custom categories and persists them under the dedicated key', () => {
  const created = addCustomCategory(['Docker'], 'PostgreSQL')
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  assert.equal(created.status, 'created')
  assert.equal(created.category, 'PostgreSQL')
  assert.deepEqual(created.categories, ['Docker', 'PostgreSQL'])
  assert.equal(saveCustomCategories(created.categories, storage), true)
  assert.deepEqual(loadCustomCategories(storage), ['Docker', 'PostgreSQL'])
  assert.equal(values.has(BUG_CATEGORIES_STORAGE_KEY), true)
})