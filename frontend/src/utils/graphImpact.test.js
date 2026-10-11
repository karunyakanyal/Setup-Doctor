import assert from 'node:assert/strict'
import test from 'node:test'
import { getImpact, getFileConnections } from './graphImpact.js'

test('getImpact: returns empty structure when graph is missing or invalid', () => {
  const result = getImpact(null, 'src/index.js')
  assert.equal(result.targetNode, null)
  assert.deepEqual(result.direct, [])
  assert.deepEqual(result.transitive, [])
  assert.equal(result.percentOfRepo, 0)
  assert.deepEqual(result.transitiveByFolder, {})
})

test('getImpact: returns empty when file is not found in graph', () => {
  const graph = {
    nodes: [{ id: 0, path: 'src/a.js' }],
    edges: [],
  }
  const result = getImpact(graph, 'src/unknown.js')
  assert.equal(result.targetNode, null)
  assert.deepEqual(result.direct, [])
  assert.deepEqual(result.transitive, [])
})

test('getImpact: leaf node with no incoming dependencies has 0% repo impact', () => {
  // src/app.js imports src/utils.js
  const graph = {
    nodes: [
      { id: 0, path: 'src/app.js' },
      { id: 1, path: 'src/utils.js' },
    ],
    edges: [[0, 1]],
  }

  // Nobody imports src/app.js
  const result = getImpact(graph, 'src/app.js')
  assert.equal(result.targetNode.path, 'src/app.js')
  assert.deepEqual(result.direct, [])
  assert.deepEqual(result.transitive, [])
  assert.equal(result.percentOfRepo, 0)
})

test('getImpact: linear chain computes direct and transitive impact accurately', () => {
  // A -> B -> C -> D
  // When D changes: C directly affected; C, B, A transitively affected (3 of 4 files = 75.0%)
  const graph = {
    nodes: [
      { id: 0, path: 'src/a.js' },
      { id: 1, path: 'src/b.js' },
      { id: 2, path: 'src/c.js' },
      { id: 3, path: 'src/d.js' },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  }

  const result = getImpact(graph, 'src/d.js')
  assert.equal(result.targetNode.path, 'src/d.js')
  assert.deepEqual(result.direct, ['src/c.js'])
  assert.equal(result.transitive.length, 3)
  assert.ok(result.transitive.includes('src/c.js'))
  assert.ok(result.transitive.includes('src/b.js'))
  assert.ok(result.transitive.includes('src/a.js'))
  assert.equal(result.percentOfRepo, 75.0)
})

test('getImpact: groups transitive files by folder correctly', () => {
  // root/entry.js -> components/Button.js -> utils/styles.js
  // services/api.js -> utils/styles.js
  const graph = {
    nodes: [
      { id: 0, path: 'root.js' },
      { id: 1, path: 'components/Button.js' },
      { id: 2, path: 'services/api.js' },
      { id: 3, path: 'utils/styles.js' },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [2, 3],
    ],
  }

  const result = getImpact(graph, 'utils/styles.js')
  assert.deepEqual(result.direct.sort(), ['components/Button.js', 'services/api.js'].sort())
  assert.equal(result.transitive.length, 3)
  assert.deepEqual(result.transitiveByFolder['components'], ['components/Button.js'])
  assert.deepEqual(result.transitiveByFolder['services'], ['services/api.js'])
  assert.deepEqual(result.transitiveByFolder['.'], ['root.js'])
})

test('getImpact: handles dependency cycles without infinite loops', () => {
  // Cycle: X -> Y -> X
  // App -> X
  const graph = {
    nodes: [
      { id: 0, path: 'src/app.js' },
      { id: 1, path: 'src/x.js' },
      { id: 2, path: 'src/y.js' },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 1],
    ],
  }

  const resultX = getImpact(graph, 'src/x.js')
  assert.ok(resultX.transitive.includes('src/app.js'))
  assert.ok(resultX.transitive.includes('src/y.js'))
  assert.equal(resultX.transitive.includes('src/x.js'), false, 'Target node itself is not in transitive list')
})

test('getFileConnections: retrieves outgoing imports and incoming importers', () => {
  const graph = {
    nodes: [
      { id: 0, path: 'src/importer.js' },
      { id: 1, path: 'src/center.js' },
      { id: 2, path: 'src/imported.js' },
    ],
    edges: [
      [0, 1], // importer imports center
      [1, 2], // center imports imported
    ],
  }

  const conn = getFileConnections(graph, 'src/center.js')
  assert.deepEqual(conn.importers, ['src/importer.js'])
  assert.deepEqual(conn.imports, ['src/imported.js'])
})
