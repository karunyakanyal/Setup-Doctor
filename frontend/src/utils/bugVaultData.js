export const BUG_STATUS_UNRESOLVED = 'unresolved'
export const BUG_STATUS_SOLVED = 'solved'

/**
 * Canonical records use developer-confirmed cause/verifiedSolution values.
 * SetupDoctor rationale belongs in source metadata; repository carries an
 * optional stable id alongside its display name.
 */
export const BUG_RECORD_FIELDS = [
  'id',
  'problem',
  'error',
  'cause',
  'suggestedFix',
  'whatITried',
  'verifiedSolution',
  'status',
  'category',
  'repository',
  'source',
  'createdAt',
  'updatedAt',
]

function textValue(value) {
  return value == null ? '' : String(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function storedSolutionValue(bug = {}) {
  return hasOwn(bug, 'verifiedSolution')
    ? bug.verifiedSolution
    : bug.solution
}

function normalizeSource(source) {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return { ...source, type: textValue(source.type) || 'unknown' }
  }

  return { type: 'unknown' }
}

export function normalizeRepository(repository) {
  if (repository == null || repository === '') return null

  if (typeof repository === 'string') {
    return { id: null, fullName: repository }
  }

  if (typeof repository === 'object' && !Array.isArray(repository)) {
    return {
      ...repository,
      id: repository.id ?? null,
      fullName: textValue(repository.fullName || repository.name) || null,
    }
  }

  return { id: null, fullName: textValue(repository) }
}

export function getBugRepositoryName(bug = {}) {
  const repository = bug.repository
  if (typeof repository === 'string') return repository
  if (!repository || typeof repository !== 'object') return ''

  return textValue(repository.fullName || repository.name || repository.id)
}

const DIAGNOSTIC_PROBLEM_TITLES = {
  'package-json': 'Package configuration file is missing or invalid',
  scripts: 'Project scripts are missing',
  'build-script': 'Build script is missing',
  'dev-script': 'Development script is missing',
  dependencies: 'Project dependencies are missing',
  'node-engine': 'Node.js version requirement is missing',
  'dependency-count': 'Dependency configuration needs review',
  'duplicate-dependencies': 'Duplicate dependencies detected',
  'dependency-version-validity': 'Invalid dependency version detected',
  'react-version-consistency': 'React package versions are inconsistent',
  lockfile: 'Package manager lockfile is missing',
  'package-manager-consistency': 'Package manager configuration is inconsistent',
  readme: 'Project setup documentation is missing',
  gitignore: 'Git ignore configuration is missing',
  'react-dependencies': 'React browser dependency is missing',
  'vite-dependency': 'Vite dependency is missing',
  'eslint-dependency': 'ESLint dependency is missing',
  'typescript-dependency': 'TypeScript dependency is missing',
  'environment-example': 'Environment example file is missing',
  'environment-file-safety': 'Environment file may expose secrets',
  'environment-documentation': 'Environment variable documentation is missing',
}

function getDiagnosticProblemTitle(rule) {
  const normalizedRule = textValue(rule).trim()
  if (!normalizedRule) return ''

  return DIAGNOSTIC_PROBLEM_TITLES[normalizedRule] || normalizedRule
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function isValidBugStatus(status) {
  return status === BUG_STATUS_UNRESOLVED || status === BUG_STATUS_SOLVED
}

export function getBugStatus(bug = {}) {
  if (
    isValidBugStatus(bug.status)
  ) {
    return bug.status
  }

  return textValue(storedSolutionValue(bug)).trim()
    ? BUG_STATUS_SOLVED
    : BUG_STATUS_UNRESOLVED
}

export function getBugVerifiedSolution(bug = {}) {
  return getBugStatus(bug) === BUG_STATUS_SOLVED
    ? textValue(storedSolutionValue(bug))
    : ''
}

export function getBugSolutionNotes(bug = {}) {
  if (getBugStatus(bug) !== BUG_STATUS_UNRESOLVED) return ''
  return textValue(bug.solution)
}

export function normalizeBugRecord(record = {}) {
  const status = getBugStatus(record)

  return {
    ...record,
    id: record.id ?? null,
    problem: textValue(record.problem),
    error: textValue(record.error),
    cause: textValue(record.cause),
    suggestedFix: textValue(record.suggestedFix),
    whatITried: textValue(record.whatITried),
    verifiedSolution: status === BUG_STATUS_SOLVED
      ? textValue(storedSolutionValue(record))
      : '',
    status,
    category: record.category ?? null,
    repository: normalizeRepository(record.repository),
    source: normalizeSource(record.source),
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
  }
}

export function createBugRecord(values = {}, metadata = {}) {
  const status = isValidBugStatus(values.status)
    ? values.status
    : getBugStatus(values)

  return {
    id: metadata.id ?? values.id ?? Date.now(),
    problem: textValue(values.problem),
    error: textValue(values.error),
    cause: textValue(values.cause),
    suggestedFix: textValue(values.suggestedFix),
    whatITried: textValue(values.whatITried),
    verifiedSolution: status === BUG_STATUS_SOLVED
      ? textValue(storedSolutionValue(values))
      : '',
    status,
    category: values.category ?? null,
    repository: normalizeRepository(values.repository),
    source: values.source
      ? normalizeSource(values.source)
      : { type: 'manual' },
    createdAt: metadata.createdAt ?? values.createdAt ?? new Date().toISOString(),
    updatedAt: metadata.updatedAt ?? values.updatedAt ?? null,
  }
}

export function createBugDraftFromDiagnostic(diagnostic = {}) {
  return {
    problem: getDiagnosticProblemTitle(diagnostic.rule) || textValue(diagnostic.message),
    error: textValue(diagnostic.message),
    cause: '',
    suggestedFix: textValue(diagnostic.recommendation),
    status: BUG_STATUS_UNRESOLVED,
    whatITried: '',
    verifiedSolution: '',
    source: {
      type: 'setupdoctor',
      diagnosticRule: textValue(diagnostic.rule) || null,
      diagnosticPriority: diagnostic.priority ?? null,
      diagnosticWhy: textValue(diagnostic.why) || null,
    },
  }
}

export function createBugDraftFromSavedBug(bug = {}) {
  const record = normalizeBugRecord(bug)

  return {
    id: record.id,
    problem: record.problem,
    error: record.error,
    cause: record.cause,
    suggestedFix: record.suggestedFix,
    status: record.status,
    whatITried: record.whatITried,
    verifiedSolution: record.verifiedSolution,
    category: record.category,
    repository: record.repository,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function updateBugDraftStatus(draft = {}, status) {
  return {
    ...draft,
    status,
    ...(status === BUG_STATUS_UNRESOLVED ? { verifiedSolution: '' } : {}),
  }
}

export function validateBugDraft(draft = {}) {
  if (!textValue(draft.problem).trim()) {
    return 'problem-required'
  }

  if (
    getBugStatus(draft) === BUG_STATUS_SOLVED &&
    !textValue(draft.verifiedSolution).trim()
  ) {
    return 'solution-required'
  }

  return ''
}

export function getBugSearchText(bug = {}) {
  return [
    bug.problem,
    bug.error,
    bug.cause,
    bug.suggestedFix,
    bug.whatITried,
    bug.verifiedSolution,
    bug.solution,
    getBugRepositoryName(bug),
    bug.category,
  ]
    .map((value) => textValue(value || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function getBugCategorizationInput(bug = {}) {
  return {
    problem: bug.problem,
    error: bug.error,
    cause: bug.cause,
    solution: textValue(bug.verifiedSolution || bug.solution),
  }
}