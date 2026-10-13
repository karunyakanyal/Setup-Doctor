import assert from 'node:assert/strict'
import test from 'node:test'
import { getImpact, getFileConnections, getCycleOverstatedImpact } from './graphImpact.js'

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

test('getImpact: linear chain computes direct and transitive impact accurately (transitive excludes direct)', () => {
  // A -> B -> C -> D
  // When D changes: C directly affected; B, A transitively affected beyond C (3 of 4 files = 75.0%)
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
  // Transitive must exclude direct (src/c.js)
  assert.equal(result.transitive.length, 2)
  assert.equal(result.transitive.includes('src/c.js'), false)
  assert.ok(result.transitive.includes('src/b.js'))
  assert.ok(result.transitive.includes('src/a.js'))
  assert.equal(result.totalAffected, 3)
  assert.equal(result.percentOfRepo, 75.0)
})

test('getImpact: groups transitive files by folder correctly excluding direct files', () => {
  // root.js -> components/Button.js -> utils/styles.js
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
  // Only root.js is transitive beyond direct
  assert.equal(result.transitive.length, 1)
  assert.deepEqual(result.transitive, ['root.js'])
  assert.deepEqual(result.transitiveByFolder['.'], ['root.js'])
  assert.equal(result.transitiveByFolder['components'], undefined)
  assert.equal(result.transitiveByFolder['services'], undefined)
})

test('getImpact: test where direct === all affected', () => {
  // X -> Z, Y -> Z. Nothing imports X or Y.
  const graph = {
    nodes: [
      { id: 0, path: 'src/x.js' },
      { id: 1, path: 'src/y.js' },
      { id: 2, path: 'src/z.js' },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  }

  const result = getImpact(graph, 'src/z.js')
  assert.equal(result.direct.length, 2)
  assert.ok(result.direct.includes('src/x.js'))
  assert.ok(result.direct.includes('src/y.js'))
  // direct === all affected -> transitive must be completely empty
  assert.deepEqual(result.transitive, [])
  assert.equal(result.totalAffected, 2)
  assert.deepEqual(result.transitiveByFolder, {})
  assert.equal(result.percentOfRepo, 66.7)
})

test('getImpact: handles dependency cycles without infinite loops', () => {
  // Cycle: X <-> Y
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
  // Direct importers of X are App and Y
  assert.equal(resultX.direct.length, 2)
  assert.ok(resultX.direct.includes('src/app.js'))
  assert.ok(resultX.direct.includes('src/y.js'))
  // Transitive excludes direct, so empty
  assert.deepEqual(resultX.transitive, [])
  assert.equal(resultX.transitive.includes('src/x.js'), false)
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

test('getCycleOverstatedImpact: computes overstated count for files in cycles', () => {
  // Cycle between A and B: A <-> B
  // External importer X imports B: X -> B
  // External importer Y imports A: Y -> A
  const graph = {
    nodes: [
      { id: 0, path: 'src/a.js' },
      { id: 1, path: 'src/b.js' },
      { id: 2, path: 'src/x.js' },
      { id: 3, path: 'src/y.js' },
      { id: 4, path: 'src/leaf.js' },
    ],
    edges: [
      [0, 1], // A imports B
      [1, 0], // B imports A
      [2, 1], // X imports B
      [3, 0], // Y imports A
    ],
  }
  const cycles = [
    { files: ['src/a.js', 'src/b.js'], shortest: ['src/a.js', 'src/b.js'] },
  ]

  // For A: Y directly imports A. B imports A.
  // X imports B, so X affects A only through the cycle (via B).
  const impactA = getCycleOverstatedImpact(graph, cycles, 'src/a.js')
  assert.equal(impactA.inCycle, true)
  assert.equal(impactA.overstatedCount, 1)

  // Non-cycle leaf file
  const impactLeaf = getCycleOverstatedImpact(graph, cycles, 'src/leaf.js')
  assert.equal(impactLeaf.inCycle, false)
  assert.equal(impactLeaf.overstatedCount, 0)
})

