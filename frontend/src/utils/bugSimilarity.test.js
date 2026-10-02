import assert from 'node:assert/strict'
import test from 'node:test'
import { findSimilarBugs } from './bugSimilarity.js'

const message = 'The project does not specify a Node.js version requirement.'
const savedBug = {
  id: 1,
  problem: 'Node version mismatch',
  error: 'Unsupported runtime detected during installation',
  cause: 'Local environment differs from deployment configuration',
  solution: 'Set engines.node in package.json.',
}

test('Node warning matches a saved problem despite additional error/cause details', () => {
  const results = findSimilarBugs({
    problem: message,
    error: message,
    cause: '',
    bugs: [savedBug],
    limit: 3,
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].bug, savedBug)
  assert.equal(results[0].bug.solution, savedBug.solution)
})

test('still matches supporting details when the saved title differs', () => {
  const bug = { ...savedBug, problem: 'Install failed', error: message }
  assert.equal(findSimilarBugs({ problem: message, bugs: [bug] })[0].bug, bug)
})

test('unrelated entries and empty input do not produce suggestions', () => {
  assert.deepEqual(findSimilarBugs({ problem: 'Database authentication failed', bugs: [savedBug] }), [])
  assert.deepEqual(findSimilarBugs({ bugs: [savedBug] }), [])
  assert.deepEqual(findSimilarBugs({ problem: message, bugs: [] }), [])
})

test('keeps results ranked and limited to three without mutating saved entries', () => {
  const bugs = [savedBug, ...[2, 3, 4].map((id) => ({ ...savedBug, id, problem: message }))]
  const before = structuredClone(bugs)
  const results = findSimilarBugs({ problem: message, bugs, limit: 3 })
  assert.deepEqual(results.map(({ bug }) => bug.id), [2, 3, 4])
  assert.deepEqual(bugs, before)
})
