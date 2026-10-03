import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exportBugVault,
  parseBugVaultImport,
  mergeBugs,
  BUG_VAULT_EXPORT_VERSION,
} from './bugVaultTransfer.js'

test('bugVaultTransfer: parseBugVaultImport handles corrupt JSON gracefully', () => {
  assert.doesNotThrow(() => {
    const result = parseBugVaultImport('{ this is definitely not valid json : [')
    assert.deepEqual(result, { bugs: [], categories: [], skipped: 0 })
  })

  assert.doesNotThrow(() => {
    const result = parseBugVaultImport('')
    assert.deepEqual(result, { bugs: [], categories: [], skipped: 0 })
  })

  assert.doesNotThrow(() => {
    const result = parseBugVaultImport(null)
    assert.deepEqual(result, { bugs: [], categories: [], skipped: 0 })
  })
})

test('bugVaultTransfer: parseBugVaultImport handles wrong shape gracefully', () => {
  // Primitive values
  assert.deepEqual(parseBugVaultImport('42'), { bugs: [], categories: [], skipped: 0 })
  assert.deepEqual(parseBugVaultImport('"a string"'), { bugs: [], categories: [], skipped: 0 })

  // Objects without valid bugs array
  assert.deepEqual(parseBugVaultImport('{"unexpected": "data"}'), { bugs: [], categories: [], skipped: 0 })
  assert.deepEqual(parseBugVaultImport('{"bugs": "not an array"}'), { bugs: [], categories: [], skipped: 0 })

  // Empty or invalid bug entries count as skipped
  const withInvalidEntries = JSON.stringify({
    version: 1,
    bugs: [
      { id: 'b1', problem: 'Valid problem 1' },
      null,
      'invalid item',
      { id: null, problem: 'Missing id' },
      { id: 'b2' }, // Missing both problem and error
      { id: 'b3', error: 'Only error message' },
    ],
    categories: ['Custom Category', '   '],
  })

  const parsed = parseBugVaultImport(withInvalidEntries)
  assert.equal(parsed.bugs.length, 2)
  assert.equal(parsed.bugs[0].id, 'b1')
  assert.equal(parsed.bugs[1].id, 'b3')
  assert.equal(parsed.skipped, 4)
  assert.deepEqual(parsed.categories, ['Custom Category'])
})

test('bugVaultTransfer: mergeBugs dedupes by id and keeps the newer updatedAt', () => {
  const existing = [
    {
      id: 'bug-1',
      problem: 'Old bug 1 problem',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 'bug-2',
      problem: 'Newer existing bug 2',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'bug-3',
      problem: 'Existing bug 3',
      updatedAt: '2026-01-15T10:00:00.000Z',
    },
  ]

  const incoming = [
    {
      id: 'bug-1', // Duplicate id with newer timestamp
      problem: 'Updated bug 1 problem from incoming',
      updatedAt: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 'bug-2', // Duplicate id with older timestamp
      problem: 'Older incoming bug 2 problem',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 'bug-4', // New incoming bug
      problem: 'Brand new bug 4',
      updatedAt: '2026-02-15T10:00:00.000Z',
    },
  ]

  const merged = mergeBugs(existing, incoming)

  assert.equal(merged.length, 4)

  const bug1 = merged.find((b) => b.id === 'bug-1')
  assert.equal(bug1.problem, 'Updated bug 1 problem from incoming')

  const bug2 = merged.find((b) => b.id === 'bug-2')
  assert.equal(bug2.problem, 'Newer existing bug 2')

  const bug3 = merged.find((b) => b.id === 'bug-3')
  assert.equal(bug3.problem, 'Existing bug 3')

  const bug4 = merged.find((b) => b.id === 'bug-4')
  assert.equal(bug4.problem, 'Brand new bug 4')
})

test('bugVaultTransfer: exportBugVault and parseBugVaultImport round trip', () => {
  const sampleBugs = [
    {
      id: 'round-trip-1',
      problem: 'Missing build script in package.json',
      error: 'npm ERR! missing script: build',
      cause: 'Package.json lacks build target',
      suggestedFix: 'Add build script',
      status: 'unresolved',
      category: 'Build',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'round-trip-2',
      problem: 'Port conflict in server',
      error: 'EADDRINUSE: 5000',
      cause: 'Another server running on 5000',
      suggestedFix: 'Kill existing process or change port',
      verifiedSolution: 'Used port 5001',
      status: 'solved',
      category: 'Backend',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    },
  ]

  const sampleCategories = ['Docker', 'Kubernetes']

  const exportedJson = exportBugVault(sampleBugs, sampleCategories)
  const parsedExport = JSON.parse(exportedJson)

  assert.equal(parsedExport.version, BUG_VAULT_EXPORT_VERSION)
  assert.ok(typeof parsedExport.exportedAt === 'string')
  assert.equal(parsedExport.bugs.length, 2)
  assert.deepEqual(parsedExport.categories, ['Docker', 'Kubernetes'])

  const imported = parseBugVaultImport(exportedJson)
  assert.equal(imported.skipped, 0)
  assert.equal(imported.bugs.length, 2)
  assert.equal(imported.bugs[0].id, 'round-trip-1')
  assert.equal(imported.bugs[0].problem, 'Missing build script in package.json')
  assert.equal(imported.bugs[1].id, 'round-trip-2')
  assert.equal(imported.bugs[1].verifiedSolution, 'Used port 5001')
  assert.deepEqual(imported.categories, ['Docker', 'Kubernetes'])
})
