import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUG_STATUS_SOLVED,
  BUG_STATUS_UNRESOLVED,
  createBugRecord,
  createBugDraftFromDiagnostic,
  createBugDraftFromSavedBug,
  getBugVerifiedSolution,
  getBugSearchText,
  getBugStatus,
  normalizeBugRecord,
  normalizeRepository,
  updateBugDraftStatus,
  isValidBugStatus,
  validateBugDraft,
  isDiagnosticSavedInVault,
} from './bugVaultData.js'

test('maps node-engine diagnostics to a concise problem and preserves the error', () => {
  const draft = createBugDraftFromDiagnostic({
    rule: 'node-engine',
    priority: 'high',
    message: 'The project does not specify a Node.js version requirement.',
    why: 'The project requires a newer Node version.',
    recommendation: 'Install Node.js 20.',
  })

  assert.equal(draft.problem, 'Node.js version requirement is missing')
  assert.equal(
    draft.error,
    'The project does not specify a Node.js version requirement.',
  )
  assert.notEqual(draft.problem, draft.error)
  assert.equal(draft.cause, '')
  assert.equal(draft.suggestedFix, 'Install Node.js 20.')
  assert.equal(draft.verifiedSolution, '')
  assert.equal(draft.whatITried, '')
  assert.equal(draft.status, BUG_STATUS_UNRESOLVED)
  assert.deepEqual(draft.source, {
    type: 'setupdoctor',
    diagnosticRule: 'node-engine',
    ruleId: 'node-engine',
    category: null,
    framework: null,
    fix: null,
    diagnosticPriority: 'high',
    diagnosticWhy: 'The project requires a newer Node version.',
  })
  assert.notEqual(draft.cause, draft.source.diagnosticWhy)
})

test('stores ruleId, category, framework, and fix metadata on bug draft and source', () => {
  const fixObj = {
    description: 'Install eslint',
    command: 'npm install --save-dev eslint',
  }

  const draft = createBugDraftFromDiagnostic({
    ruleId: 'eslint-dependency',
    category: 'dependencies',
    framework: 'react',
    fix: fixObj,
    priority: 'medium',
    message: 'ESLint package is missing.',
    why: 'Code quality tooling is absent.',
    recommendation: 'Install eslint.',
  })

  assert.equal(draft.ruleId, 'eslint-dependency')
  assert.equal(draft.category, 'dependencies')
  assert.equal(draft.framework, 'react')
  assert.deepEqual(draft.fix, fixObj)
  assert.equal(draft.suggestedFix, 'npm install --save-dev eslint')
  assert.deepEqual(draft.source, {
    type: 'setupdoctor',
    diagnosticRule: 'eslint-dependency',
    ruleId: 'eslint-dependency',
    category: 'dependencies',
    framework: 'react',
    fix: fixObj,
    diagnosticPriority: 'medium',
    diagnosticWhy: 'Code quality tooling is absent.',
  })
})

test('isDiagnosticSavedInVault: correctly prevents duplicate entries for the same repository and rule', () => {
  const bugs = [
    {
      id: 1,
      repository: { fullName: 'owner/my-app' },
      source: { ruleId: 'node-engine', diagnosticRule: 'node-engine' },
    },
    {
      id: 2,
      repository: 'owner/other-app',
      source: { ruleId: 'eslint-dependency' },
    },
  ]

  // Found for owner/my-app
  assert.equal(
    isDiagnosticSavedInVault(bugs, 'owner/my-app', { ruleId: 'node-engine' }),
    true,
  )
  // Not found for other repo
  assert.equal(
    isDiagnosticSavedInVault(bugs, 'owner/other-app', { ruleId: 'node-engine' }),
    false,
  )
  // Not found if rule hasn't been saved
  assert.equal(
    isDiagnosticSavedInVault(bugs, 'owner/my-app', { ruleId: 'missing-readme' }),
    false,
  )
  // Safe handling of null/empty values
  assert.equal(isDiagnosticSavedInVault([], 'owner/my-app', null), false)
})

test('maps other known diagnostic rules to distinct human-readable titles', () => {
  const expectedTitles = {
    'environment-example': 'Environment example file is missing',
    lockfile: 'Package manager lockfile is missing',
    'duplicate-dependencies': 'Duplicate dependencies detected',
    'dependency-version-validity': 'Invalid dependency version detected',
  }

  for (const [rule, problem] of Object.entries(expectedTitles)) {
    const message = `Diagnostic message for ${rule}.`
    const draft = createBugDraftFromDiagnostic({ rule, message })

    assert.equal(draft.problem, problem)
    assert.equal(draft.error, message)
    assert.notEqual(draft.problem, draft.error)
  }
})

test('humanizes unknown diagnostic rules without using the error message', () => {
  const draft = createBugDraftFromDiagnostic({
    rule: 'package-manager-consistency',
    message: 'Several package managers are configured.',
  })

  assert.equal(draft.problem, 'Package manager configuration is inconsistent')
  assert.equal(draft.error, 'Several package managers are configured.')
  assert.notEqual(draft.problem, draft.error)

  const unknownDraft = createBugDraftFromDiagnostic({
    rule: 'workspace-config-check',
    message: 'Workspace configuration needs attention.',
  })
  assert.equal(unknownDraft.problem, 'Workspace Config Check')
  assert.equal(unknownDraft.error, 'Workspace configuration needs attention.')
})

test('does not copy a suggested fix into the verified solution', () => {
  const draft = createBugDraftFromDiagnostic({
    rule: 'node-engine',
    message: 'Node.js requirement is missing.',
    recommendation: 'Add an engines.node field to package.json.',
  })

  assert.equal(draft.suggestedFix, 'Add an engines.node field to package.json.')
  assert.equal(draft.verifiedSolution, '')
})

test('allows unresolved drafts without a verified solution', () => {
  const draft = createBugDraftFromDiagnostic({ message: 'Node issue' })

  assert.equal(validateBugDraft(draft), '')
})

test('requires a solution for solved drafts', () => {
  assert.equal(
    validateBugDraft({ problem: 'Node issue', status: BUG_STATUS_SOLVED }),
    'solution-required',
  )
  assert.equal(
    validateBugDraft({
      problem: 'Node issue',
      status: BUG_STATUS_SOLVED,
      verifiedSolution: 'Install Node.js 20.',
    }),
    '',
  )
})

test('opening an unresolved legacy bug leaves its verified solution blank', () => {
  const savedBug = {
    id: 42,
    problem: 'Environment example file is missing',
    error: '.env.example is missing.',
    suggestedFix: 'Create a .env.example file.',
    status: BUG_STATUS_UNRESOLVED,
    whatITried: 'Checked the repository root.',
    solution: 'Create a .env.example with required variable names.',
    createdAt: '2026-09-30T10:00:00.000Z',
    repository: 'example/project',
    category: 'Configuration',
  }
  const savedBugBeforeEdit = structuredClone(savedBug)
  const draft = createBugDraftFromSavedBug(savedBug)

  assert.equal(draft.status, BUG_STATUS_UNRESOLVED)
  assert.equal(draft.verifiedSolution, '')
  assert.equal(draft.suggestedFix, savedBug.suggestedFix)
  assert.equal(draft.whatITried, savedBug.whatITried)
  assert.deepEqual(savedBug, savedBugBeforeEdit)
})

test('opening a solved bug preserves its verified solution', () => {
  const draft = createBugDraftFromSavedBug({
    status: BUG_STATUS_SOLVED,
    solution: 'Node.js 20 fixed the compatibility issue.',
  })

  assert.equal(draft.status, BUG_STATUS_SOLVED)
  assert.equal(draft.verifiedSolution, 'Node.js 20 fixed the compatibility issue.')
})

test('changing an unresolved draft to solved requires a verified solution', () => {
  const unresolvedDraft = createBugDraftFromSavedBug({
    problem: 'Environment example file is missing',
    status: BUG_STATUS_UNRESOLVED,
    verifiedSolution: '',
  })
  const solvedDraft = updateBugDraftStatus(
    unresolvedDraft,
    BUG_STATUS_SOLVED,
  )

  assert.equal(solvedDraft.verifiedSolution, '')
  assert.equal(validateBugDraft(solvedDraft), 'solution-required')
})

test('changing a solved draft to unresolved clears only its editable solution', () => {
  const savedBug = {
    status: BUG_STATUS_SOLVED,
    verifiedSolution: 'The confirmed fix.',
    suggestedFix: 'Suggested next step.',
  }
  const unresolvedDraft = updateBugDraftStatus(
    createBugDraftFromSavedBug(savedBug),
    BUG_STATUS_UNRESOLVED,
  )

  assert.equal(unresolvedDraft.verifiedSolution, '')
  assert.equal(unresolvedDraft.suggestedFix, 'Suggested next step.')
  assert.deepEqual(savedBug, {
    status: BUG_STATUS_SOLVED,
    verifiedSolution: 'The confirmed fix.',
    suggestedFix: 'Suggested next step.',
  })
})

test('infers status for legacy bugs without rewriting their stored shape', () => {
  const solvedBug = {
    problem: 'Old solved bug',
    error: 'Old solved bug',
    solution: 'Use Node 20.',
  }
  const unresolvedBug = {
    problem: 'Old open bug',
    error: 'Unknown issue',
  }

  assert.equal(getBugStatus(solvedBug), BUG_STATUS_SOLVED)
  assert.equal(getBugStatus(unresolvedBug), BUG_STATUS_UNRESOLVED)
  assert.deepEqual(createBugDraftFromSavedBug(solvedBug), {
    id: null,
    problem: 'Old solved bug',
    error: 'Old solved bug',
    cause: '',
    suggestedFix: '',
    status: BUG_STATUS_SOLVED,
    whatITried: '',
    verifiedSolution: 'Use Node 20.',
    category: null,
    repository: null,
    source: { type: 'unknown' },
    createdAt: null,
    updatedAt: null,
  })
  assert.deepEqual(unresolvedBug, {
    problem: 'Old open bug',
    error: 'Unknown issue',
  })
})

test('search text includes new fields plus category and repository', () => {
  const searchText = getBugSearchText({
    suggestedFix: 'Install Node 20',
    whatITried: 'Reinstalled Node',
    category: 'Environment',
    repository: 'example/app',
  })

  assert.match(searchText, /install node 20/)
  assert.match(searchText, /reinstalled node/)
  assert.match(searchText, /environment/)
  assert.match(searchText, /example\/app/)
})

test('creates manual bugs with canonical fields and manual provenance', () => {
  const record = createBugRecord({
    problem: 'Build script is missing',
    error: 'npm run build is unavailable.',
    cause: 'The package manifest has no build script.',
    suggestedFix: 'Add a build script.',
    whatITried: 'Inspected package.json.',
    verifiedSolution: 'Added the project build command.',
    status: BUG_STATUS_SOLVED,
    category: 'Build',
    repository: 'example/project',
  })

  assert.equal(record.source.type, 'manual')
  assert.equal(record.verifiedSolution, 'Added the project build command.')
  assert.equal(Object.hasOwn(record, 'solution'), false)
  assert.deepEqual(record.repository, {
    id: null,
    fullName: 'example/project',
  })
})

test('normalizes legacy solution only when legacy status rules consider it solved', () => {
  const solvedLegacy = {
    status: 'solved',
    solution: 'The confirmed fix.',
  }
  const unresolvedLegacy = {
    status: 'unresolved',
    solution: 'An old unverified note.',
  }
  const solvedBefore = structuredClone(solvedLegacy)
  const unresolvedBefore = structuredClone(unresolvedLegacy)

  assert.equal(normalizeBugRecord(solvedLegacy).verifiedSolution, 'The confirmed fix.')
  assert.equal(normalizeBugRecord(unresolvedLegacy).verifiedSolution, '')
  assert.equal(getBugVerifiedSolution(unresolvedLegacy), '')
  assert.deepEqual(solvedLegacy, solvedBefore)
  assert.deepEqual(unresolvedLegacy, unresolvedBefore)
})

test('preserves timestamps, repository identity, and unknown legacy categories', () => {
  const createdAt = '2024-01-02T03:04:05.000Z'
  const updatedAt = '2024-02-03T04:05:06.000Z'
  const legacy = normalizeBugRecord({
    createdAt,
    updatedAt,
    repository: 'owner/project',
    category: 'Infrastructure - Legacy',
  })

  assert.equal(legacy.createdAt, createdAt)
  assert.equal(legacy.updatedAt, updatedAt)
  assert.equal(legacy.category, 'Infrastructure - Legacy')
  assert.deepEqual(legacy.repository, {
    id: null,
    fullName: 'owner/project',
  })
  assert.deepEqual(
    normalizeRepository({ id: 'repo-123', fullName: 'owner/project' }),
    { id: 'repo-123', fullName: 'owner/project' },
  )
})

test('invalid statuses fall back to legacy solution inference safely', () => {
  assert.equal(isValidBugStatus('solved'), true)
  assert.equal(isValidBugStatus('pending'), false)
  assert.equal(
    getBugStatus({ status: 'pending', solution: 'Legacy fix.' }),
    BUG_STATUS_SOLVED,
  )
  assert.equal(
    getBugStatus({ status: 'pending', solution: '' }),
    BUG_STATUS_UNRESOLVED,
  )
})