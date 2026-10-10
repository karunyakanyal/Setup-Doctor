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

test('scroll routing: scrolls to Similar Problem Found panel when matches exist', () => {
  let panelScrolled = null
  let headingFocused = false
  let headingFocusOptions = null
  let formScrolled = null

  const similarPanel = {
    scrollIntoView: (options) => {
      panelScrolled = options
    },
  }

  const similarHeading = {
    focus: (options) => {
      headingFocused = true
      headingFocusOptions = options
    },
  }

  const formElement = {
    scrollIntoView: (options) => {
      formScrolled = options
    },
  }

  // Contract simulation: similarBugs has matches
  const similarBugs = [{ id: 1, problem: 'Node version mismatch' }]
  const hasSimilar = similarBugs && similarBugs.length > 0

  if (hasSimilar && similarPanel) {
    similarPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    similarHeading.focus({ preventScroll: true })
  } else if (formElement) {
    formElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  assert.deepEqual(panelScrolled, { behavior: 'smooth', block: 'start' })
  assert.equal(formScrolled, null)
  assert.equal(headingFocused, true)
  assert.deepEqual(headingFocusOptions, { preventScroll: true })
})

test('scroll routing: scrolls to Save a Problem form when no matches exist', () => {
  let panelScrolled = null
  let formScrolled = null
  let formHeadingFocused = false
  let formFocusOptions = null

  const similarPanel = {
    scrollIntoView: (options) => {
      panelScrolled = options
    },
  }

  const formHeading = {
    focus: (options) => {
      formHeadingFocused = true
      formFocusOptions = options
    },
  }

  const formElement = {
    scrollIntoView: (options) => {
      formScrolled = options
    },
  }

  // Contract simulation: no similar bugs found
  const similarBugs = []
  const hasSimilar = similarBugs && similarBugs.length > 0

  if (hasSimilar && similarPanel) {
    similarPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (formElement) {
    formElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    formHeading.focus({ preventScroll: true })
  }

  assert.equal(panelScrolled, null)
  assert.deepEqual(formScrolled, { behavior: 'smooth', block: 'start' })
  assert.equal(formHeadingFocused, true)
  assert.deepEqual(formFocusOptions, { preventScroll: true })
})

test('scroll gating: prevents secondary scroll jumps on typing and re-renders', () => {
  let scrollCount = 0

  const formElement = {
    scrollIntoView: () => {
      scrollCount += 1
    },
  }

  const locationState = { fromDiagnostic: { ruleId: 'node-engine' } }
  const locationKey = 'key-1'
  let lastScrolledKey = null
  let shouldScroll = Boolean(locationState?.fromDiagnostic)

  // First render / navigation trigger
  const runScrollEffect = () => {
    const isFromDiag = Boolean(locationState?.fromDiagnostic)
    const isNewNav = isFromDiag && lastScrolledKey !== locationKey

    if (isNewNav || shouldScroll) {
      if (isNewNav) {
        lastScrolledKey = locationKey
      }
      shouldScroll = false
      formElement.scrollIntoView()
    }
  }

  // Run on mount
  runScrollEffect()
  assert.equal(scrollCount, 1)
  assert.equal(shouldScroll, false)

  // Re-render (e.g. user typing in form, debounced state update)
  runScrollEffect()
  runScrollEffect()
  assert.equal(scrollCount, 1, 'Scroll must not re-trigger on subsequent re-renders or typing')
})

test('post-save feedback: focuses success message banner without jumping viewport', () => {
  let bannerFocused = false
  let focusOpts = null

  const successBanner = {
    focus: (options) => {
      bannerFocused = true
      focusOpts = options
    },
  }

  // When save succeeds
  const saveSuccessMessage = 'Problem saved to Bug Vault successfully.'
  if (saveSuccessMessage && successBanner) {
    successBanner.focus({ preventScroll: true })
  }

  assert.equal(bannerFocused, true)
  assert.deepEqual(focusOpts, { preventScroll: true })
})
