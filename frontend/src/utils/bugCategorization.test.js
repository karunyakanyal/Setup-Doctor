import assert from 'node:assert/strict'
import test from 'node:test'
import { categorizeBug } from './bugCategorization.js'

test('detects common Bug Vault categories from combined problem details', () => {
  assert.equal(categorizeBug({ problem: 'Node version mismatch' }), 'Environment')
  assert.equal(categorizeBug({ problem: 'npm dependency conflict' }), 'Dependencies')
  assert.equal(categorizeBug({ problem: '.env.example missing' }), 'Configuration')
  assert.equal(categorizeBug({ problem: 'npm run build failed' }), 'Build')
  assert.equal(categorizeBug({ problem: 'Module crashes at runtime' }), 'Runtime')
  assert.equal(categorizeBug({ problem: 'git push rejected' }), 'Git')
  assert.equal(categorizeBug({ problem: 'React CSS component issue' }), 'Frontend')
  assert.equal(categorizeBug({ problem: 'Express API server issue' }), 'Backend')
})

test('prefers specific environment, dependency, configuration, and build causes', () => {
  assert.equal(
    categorizeBug({ problem: 'Node version requirement blocks npm install' }),
    'Environment',
  )
  assert.equal(
    categorizeBug({ problem: 'React build error in the browser component' }),
    'Build',
  )
  assert.equal(
    categorizeBug({ problem: 'npm install dependency conflict in React' }),
    'Dependencies',
  )
  assert.equal(
    categorizeBug({ problem: 'Environment variable missing from .env.example' }),
    'Configuration',
  )
})

test('handles missing details, case differences, and unknown problems', () => {
  assert.equal(categorizeBug({ problem: 'NODE.JS VERSION REQUIREMENT' }), 'Environment')
  assert.equal(categorizeBug({ problem: 'Unknown issue', error: null, cause: '' }), 'Other')
  assert.equal(categorizeBug(), 'Other')
})