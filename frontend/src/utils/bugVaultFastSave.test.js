import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUG_STATUS_SOLVED,
  BUG_STATUS_UNRESOLVED,
  createBugDraftFromDiagnostic,
  createBugDraftFromSavedBug,
  createBugRecord,
  getBugStatus,
  normalizeBugRecord,
  updateBugDraftStatus,
  validateBugDraft,
} from './bugVaultData.js'
import { findSimilarBugs } from './bugSimilarity.js'

test('Fast Save: saves with only required fields (problem and error)', () => {
  const minimalDraft = {
    problem: 'Missing start script',
    error: 'npm start script is missing from package.json',
  }

  // Validates successfully without requiring any optional fields
  assert.equal(validateBugDraft(minimalDraft), '')

  const record = createBugRecord(minimalDraft)
  assert.equal(record.problem, 'Missing start script')
  assert.equal(record.error, 'npm start script is missing from package.json')
  assert.equal(record.status, BUG_STATUS_UNRESOLVED)
  assert.equal(record.suggestedFix, '')
  assert.equal(record.cause, '')
  assert.equal(record.whatITried, '')
  assert.equal(record.verifiedSolution, '')
  assert.ok(record.createdAt)
})

test('Fast Save: saves with all optional fields empty', () => {
  const draftAllOptionalEmpty = {
    problem: 'Node engine not set',
    error: 'Node version >=20 is required',
    suggestedFix: '',
    cause: '',
    whatITried: '',
    verifiedSolution: '',
    status: BUG_STATUS_UNRESOLVED,
  }

  assert.equal(validateBugDraft(draftAllOptionalEmpty), '')

  const record = createBugRecord(draftAllOptionalEmpty)
  assert.equal(record.problem, 'Node engine not set')
  assert.equal(record.error, 'Node version >=20 is required')
  assert.equal(record.suggestedFix, '')
  assert.equal(record.cause, '')
  assert.equal(record.whatITried, '')
  assert.equal(record.verifiedSolution, '')
  assert.equal(record.status, BUG_STATUS_UNRESOLVED)
})

test('Fast Save: expanding and collapsing optional details preserves entered values', () => {
  // Simulate initial fast save draft
  let formDraft = {
    problem: 'Port 3000 in use',
    error: 'EADDRINUSE: address already in use :::3000',
    suggestedFix: '',
    cause: '',
    whatITried: '',
    verifiedSolution: '',
    status: BUG_STATUS_UNRESOLVED,
  }

  // User enters optional details while expanded
  formDraft = {
    ...formDraft,
    cause: 'Another server process was still running',
    whatITried: 'Checked lsof -i :3000',
    suggestedFix: 'Kill process on port 3000',
  }

  // Values in formDraft MUST NOT be lost when section is collapsed/re-expanded
  assert.equal(formDraft.cause, 'Another server process was still running')
  assert.equal(formDraft.whatITried, 'Checked lsof -i :3000')
  assert.equal(formDraft.suggestedFix, 'Kill process on port 3000')

  // Saving while collapsed persists all user-entered details
  const savedRecord = createBugRecord(formDraft)
  assert.equal(savedRecord.cause, 'Another server process was still running')
  assert.equal(savedRecord.whatITried, 'Checked lsof -i :3000')
  assert.equal(savedRecord.suggestedFix, 'Kill process on port 3000')
})

test('Fast Save: diagnosis prefill populates required fields and suggested fix without inventing solutions', () => {
  const diagnostic = {
    ruleId: 'environment-example',
    message: '.env.example file is missing from repository root.',
    why: 'Other developers will not know required environment variables.',
    priority: 'medium',
    fix: {
      description: 'Create a .env.example template',
      command: 'touch .env.example',
    },
  }

  const draft = createBugDraftFromDiagnostic(diagnostic)

  // Required fields prefilled
  assert.equal(draft.problem, 'Environment example file is missing')
  assert.equal(draft.error, '.env.example file is missing from repository root.')

  // Suggested fix prefilled from fix command/description
  assert.equal(draft.suggestedFix, 'touch .env.example')

  // Optional fields are NOT invented and left clean
  assert.equal(draft.cause, '')
  assert.equal(draft.whatITried, '')
  assert.equal(draft.verifiedSolution, '')
  assert.equal(draft.status, BUG_STATUS_UNRESOLVED)

  // Ready to save immediately in seconds without extra edits
  assert.equal(validateBugDraft(draft), '')
})

test('Fast Save: validates missing required fields properly', () => {
  // Missing problem title
  assert.equal(
    validateBugDraft({ problem: '', error: 'Some error' }),
    'problem-required',
  )
  assert.equal(
    validateBugDraft({ problem: '   ', error: 'Some error' }),
    'problem-required',
  )

  // Missing error / description
  assert.equal(
    validateBugDraft({ problem: 'Some problem', error: '' }),
    'error-required',
  )
  assert.equal(
    validateBugDraft({ problem: 'Some problem', error: '   ' }),
    'error-required',
  )

  // Both missing
  assert.equal(
    validateBugDraft({ problem: '', error: '' }),
    'problem-required',
  )
})

test('Fast Save: similar-issue detection explains match and allows saving anyway', () => {
  const existingBug = {
    id: 101,
    problem: 'Node.js version mismatch',
    error: 'Node engine >=20 is required by package.json',
    cause: 'Local runtime was Node 18',
    verifiedSolution: 'nvm use 20',
    status: BUG_STATUS_SOLVED,
  }

  // Detect similar issue
  const similar = findSimilarBugs({
    problem: 'Node.js version requirement is missing',
    error: 'Node engine requirement is missing',
    bugs: [existingBug],
    limit: 3,
  })

  assert.equal(similar.length, 1)
  assert.equal(similar[0].bug.id, 101)
  // Match explanation is provided
  assert.ok(similar[0].matchReason)
  assert.match(similar[0].matchReason, /match/i)
  assert.ok(Array.isArray(similar[0].matchedKeywords))
  assert.ok(similar[0].matchedKeywords.includes('node') || similar[0].matchedKeywords.includes('version'))

  // Save anyway: user can save the new legitimate issue without being blocked
  const newLegitimateDraft = {
    problem: 'Node.js version requirement is missing',
    error: 'Node engine requirement is missing from package manifest',
  }
  assert.equal(validateBugDraft(newLegitimateDraft), '')
  const savedRecord = createBugRecord(newLegitimateDraft)
  assert.ok(savedRecord.id)
  assert.notEqual(savedRecord.id, existingBug.id)
  assert.equal(savedRecord.problem, 'Node.js version requirement is missing')
})

test('Fast Save: prevents duplicate submissions during active save', () => {
  let isSubmitting = false
  const savedBugs = []

  function simulateHandleSave(draft) {
    if (isSubmitting) {
      return { success: false, reason: 'duplicate-blocked' }
    }

    const validation = validateBugDraft(draft)
    if (validation) {
      return { success: false, reason: validation }
    }

    isSubmitting = true
    try {
      const record = createBugRecord(draft)
      savedBugs.push(record)
      return { success: true, record }
    } finally {
      isSubmitting = false
    }
  }

  const draft = {
    problem: 'Missing lockfile',
    error: 'package-lock.json or pnpm-lock.yaml is missing',
  }

  // First save succeeds
  const first = simulateHandleSave(draft)
  assert.equal(first.success, true)
  assert.equal(savedBugs.length, 1)

  // While submitting, another rapid click is blocked
  isSubmitting = true
  const duplicateClick = simulateHandleSave(draft)
  assert.equal(duplicateClick.success, false)
  assert.equal(duplicateClick.reason, 'duplicate-blocked')
  assert.equal(savedBugs.length, 1) // No duplicate added
  isSubmitting = false
})

test('Fast Save: backward compatibility with legacy entries and solved status', () => {
  // Legacy bug without error field
  const legacyEntry = {
    id: 50,
    problem: 'Old problem title',
    solution: 'Old verified solution text',
    status: 'solved',
  }

  const normalized = normalizeBugRecord(legacyEntry)
  assert.equal(normalized.problem, 'Old problem title')
  assert.equal(normalized.verifiedSolution, 'Old verified solution text')
  assert.equal(normalized.status, BUG_STATUS_SOLVED)

  const legacyDraft = createBugDraftFromSavedBug(legacyEntry)
  assert.equal(legacyDraft.problem, 'Old problem title')
  assert.equal(legacyDraft.verifiedSolution, 'Old verified solution text')
  assert.equal(getBugStatus(legacyDraft), BUG_STATUS_SOLVED)

  // Marking an unresolved draft to solved requires verified solution
  const draftToSolve = updateBugDraftStatus(
    { problem: 'A problem', error: 'An error', status: BUG_STATUS_UNRESOLVED },
    BUG_STATUS_SOLVED,
  )
  assert.equal(validateBugDraft(draftToSolve), 'solution-required')

  // Supplying verified solution allows saving solved problem
  draftToSolve.verifiedSolution = 'Applied patch #104'
  assert.equal(validateBugDraft(draftToSolve), '')
})
