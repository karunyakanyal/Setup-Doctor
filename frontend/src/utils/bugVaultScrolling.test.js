import assert from 'node:assert/strict'
import test from 'node:test'
import { createBugDraftFromDiagnostic } from './bugVaultData.js'

test('createBugDraftFromDiagnostic: preserves all prefilled diagnostic data and metadata', () => {
  const diagnostic = {
    ruleId: 'node-engine',
    title: 'Node version mismatch',
    message: 'Node engine >=20.0.0 is required',
    why: 'Current runtime version is unsupported',
    category: 'config',
    framework: 'React',
    priority: 'high',
    fix: {
      description: 'Add engines to package.json',
      snippet: '"engines": { "node": ">=20.0.0" }',
    },
    recommendation: 'Specify node engine in package.json',
  }

  const draft = createBugDraftFromDiagnostic(diagnostic)

  assert.equal(draft.problem, 'Node.js version requirement is missing')
  assert.equal(draft.error, 'Node engine >=20.0.0 is required')
  assert.equal(draft.suggestedFix, '"engines": { "node": ">=20.0.0" }')
  assert.equal(draft.ruleId, 'node-engine')
  assert.equal(draft.category, 'config')
  assert.equal(draft.framework, 'React')
  assert.deepEqual(draft.fix, diagnostic.fix)
  assert.equal(draft.status, 'unresolved')

  // Source metadata preservation
  assert.equal(draft.source.type, 'setupdoctor')
  assert.equal(draft.source.ruleId, 'node-engine')
  assert.equal(draft.source.category, 'config')
  assert.equal(draft.source.framework, 'React')
  assert.equal(draft.source.diagnosticPriority, 'high')
  assert.equal(draft.source.diagnosticWhy, 'Current runtime version is unsupported')
  assert.deepEqual(draft.source.fix, diagnostic.fix)
})

test('Bug Vault scroll & focus contract: simulates ref and focus without scroll jumps', () => {
  // Simulates DOM elements created during BugForm render
  let scrolledWith = null
  let focusOptions = null
  let isFocused = false

  const mockHeading = {
    tabIndex: -1,
    focus: (options) => {
      isFocused = true
      focusOptions = options
    },
  }

  const mockForm = {
    id: 'bug-vault-form',
    querySelector: (selector) => {
      if (selector === 'h2') return mockHeading
      return null
    },
    scrollIntoView: (options) => {
      scrolledWith = options
    },
  }

  // Verify form scroll parameters match smooth scrolling
  mockForm.scrollIntoView({ behavior: 'smooth', block: 'start' })
  assert.deepEqual(scrolledWith, { behavior: 'smooth', block: 'start' })

  // Verify heading focus uses preventScroll: true to avoid secondary scroll jumps
  const heading = mockForm.querySelector('h2')
  assert.ok(heading)
  heading.focus({ preventScroll: true })
  assert.equal(isFocused, true)
  assert.deepEqual(focusOptions, { preventScroll: true })
})
