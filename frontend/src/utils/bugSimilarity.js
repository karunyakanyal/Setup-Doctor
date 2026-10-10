export const GENERIC_WORDS = new Set([
  // Core stop words
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'does',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'not',
  'no',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'with',
  'without',

  // Generic project & dev terminology
  'project',
  'projects',
  'repo',
  'repos',
  'repository',
  'repositories',
  'file',
  'files',
  'package',
  'packages',
  'config',
  'configs',
  'configuration',
  'configurations',
  'configured',
  'directory',
  'directories',
  'folder',
  'folders',
  'root',
  'path',
  'paths',
  'app',
  'application',
  'applications',
  'tool',
  'tools',
  'script',
  'scripts',

  // Diagnostic / status / verb words
  'missing',
  'miss',
  'missed',
  'required',
  'requirement',
  'requirements',
  'require',
  'requires',
  'specify',
  'specifies',
  'specified',
  'unspecified',
  'declare',
  'declares',
  'declared',
  'declaration',
  'need',
  'needs',
  'needed',
  'add',
  'added',
  'adding',
  'set',
  'sets',
  'setting',
  'settings',
  'setup',
  'setups',
  'define',
  'defines',
  'defined',
  'definition',
  'detect',
  'detects',
  'detected',
  'detection',
  'found',
  'exist',
  'exists',
  'existing',
  'absent',
  'omitted',
  'check',
  'checks',
  'checked',
  'checking',
  'error',
  'errors',
  'err',
  'failed',
  'failure',
  'failures',
  'fail',
  'fails',
  'failing',
  'issue',
  'issues',
  'bug',
  'bugs',
  'problem',
  'problems',
  'warning',
  'warnings',
  'warn',
  'warns',
  'status',
  'exit',
  'code',
  'unknown',
  'unresolved',
  'solved',
  'update',
  'updates',
  'updated',
  'updating',
  'valid',
  'invalid',
  'validity',
  'support',
  'supports',
  'supported',
  'unsupported',
  'rule',
  'rules',
  'detail',
  'details',
  'value',
  'values',
  'field',
  'fields',
  'item',
  'items',
  'message',
  'messages',
  'note',
  'notes',
  'one',
  'two',
  'use',
  'uses',
  'used',
  'using',
  'run',
  'runs',
  'running',
])

export const GENERIC_TECH_WORDS = GENERIC_WORDS

export const DOMAIN_DEFINITIONS = [
  {
    id: 'license',
    label: 'License',
    rules: new Set(['missing-license', 'license']),
    tokens: new Set(['license', 'licence', 'copying', 'copyright', 'unlicense', 'mit', 'apache', 'gpl', 'bsd']),
    patterns: [/\blicen[sc]e\b/i, /\bcopyright\b/i, /\bcopying\b/i],
  },
  {
    id: 'testing',
    label: 'Testing',
    rules: new Set(['missing-test-script', 'test-script']),
    tokens: new Set(['jest', 'vitest', 'mocha', 'cypress', 'playwright', 'supertest', 'karma', 'ava']),
    patterns: [
      /\btest\s+scripts?\b/i,
      /\bpackage\.json.*test\b/i,
      /\bscripts?\.test\b/i,
      /\bautomated\s+tests?\b/i,
      /\bno\s+test\s+specified\b/i,
      /\btest\s+command\b/i,
    ],
  },
  {
    id: 'env_config',
    label: 'Environment Config',
    rules: new Set(['environment-example', 'environment-file-safety', 'environment-documentation']),
    tokens: new Set(['dotenv', 'env', 'variables', 'secret', 'secrets']),
    patterns: [/\.env(?:\.[a-z0-9_-]+)?\b/i, /\benvironment\s+variables?\b/i, /\bdotenv\b/i, /\bsecret[s]?\b/i],
  },
  {
    id: 'node_runtime',
    label: 'Node.js Runtime',
    rules: new Set(['node-engine', 'missing-nvmrc-or-engines']),
    tokens: new Set(['node', 'nodejs', 'nvmrc', 'engines', 'volta']),
    patterns: [/\bnode(?:\.js)?\b/i, /\bnvmrc\b/i, /\bengines?(?:\.node)?\b/i, /\bvolta\b/i],
  },
  {
    id: 'readme_docs',
    label: 'Documentation',
    rules: new Set(['readme', 'missing-readme']),
    tokens: new Set(['readme', 'documentation', 'docs']),
    patterns: [/\breadme(?:\.md)?\b/i, /\bdocumentation\b/i],
  },
  {
    id: 'git_vcs',
    label: 'Git',
    rules: new Set(['gitignore', 'gitignore-essentials']),
    tokens: new Set(['gitignore', 'git']),
    patterns: [/\bgitignore\b/i, /\bgit\b/i],
  },
  {
    id: 'ci_config',
    label: 'CI / CD',
    rules: new Set(['missing-ci-config']),
    tokens: new Set(['ci', 'workflow', 'workflows', 'pipeline', 'pipelines']),
    patterns: [
      /\.github\/workflows\b/i,
      /\bci\s+workflow\b/i,
      /\bgithub\s+actions\b/i,
      /\bcontinuous\s+integration\b/i,
    ],
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    rules: new Set([
      'dependencies',
      'dependency-count',
      'duplicate-dependencies',
      'dependency-version-validity',
      'unpinned-dependencies',
      'lockfile',
      'package-manager-consistency',
      'package-json',
    ]),
    tokens: new Set(['dependencies', 'dependency', 'lockfile', 'unpinned', 'semver', 'peerdependencies']),
    patterns: [/\bdependenc(?:y|ies)\b/i, /\blockfile\b/i, /\bpackage\.json\b/i, /\bnpm\s+install\b/i],
  },
  {
    id: 'scripts',
    label: 'Scripts',
    rules: new Set(['scripts', 'build-script', 'dev-script', 'express-start-script']),
    tokens: new Set(['build', 'dev', 'start', 'serve']),
    patterns: [/\bbuild\s+script\b/i, /\bdev\s+script\b/i, /\bstart\s+script\b/i, /\bproject\s+scripts?\b/i, /\bnpm\s+run\b/i],
  },
  {
    id: 'framework_react',
    label: 'React',
    rules: new Set(['react-dependencies', 'react-version-consistency', 'react-dom-version-match']),
    tokens: new Set(['react', 'react-dom']),
    patterns: [/\breact\b/i, /\breact-dom\b/i],
  },
  {
    id: 'framework_vite',
    label: 'Vite',
    rules: new Set(['vite-dependency']),
    tokens: new Set(['vite']),
    patterns: [/\bvite\b/i],
  },
  {
    id: 'framework_eslint',
    label: 'ESLint',
    rules: new Set(['eslint-dependency']),
    tokens: new Set(['eslint']),
    patterns: [/\beslint\b/i],
  },
  {
    id: 'framework_typescript',
    label: 'TypeScript',
    rules: new Set(['typescript-dependency']),
    tokens: new Set(['typescript', 'tsconfig']),
    patterns: [/\btypescript\b/i, /\btsconfig\b/i],
  },
]

const MISSING_SIGNALS = new Set([
  'missing',
  'specify',
  'specifies',
  'specified',
  'unspecified',
  'omitted',
  'absent',
  'undefined',
  'undeclared',
  'declare',
  'declares',
  'declaration',
  'required',
  'requirement',
  'requirements',
  'needed',
  'needs',
])

const MISMATCH_SIGNALS = new Set([
  'mismatch',
  'mismatches',
  'incompatible',
  'incompatibility',
  'unsupported',
  'conflict',
  'conflicting',
  'conflicts',
  'different',
  'differs',
])

function tokenize(text) {
  if (typeof text !== 'string') {
    return []
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1)
}

function createTokenSet(text) {
  return new Set(tokenize(text))
}

function normalizeText(text) {
  if (text == null) return ''
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ')
}

export function detectSemanticDomains(text = '', ruleId = '', category = '') {
  const normRule = normalizeText(ruleId)
  const normText = normalizeText(text)
  const normCat = normalizeText(category)
  const domains = new Set()

  // 1. Authoritative check: if ruleId belongs to a known domain, use that specific domain directly
  if (normRule) {
    for (const def of DOMAIN_DEFINITIONS) {
      if (def.rules.has(normRule)) {
        domains.add(def.id)
      }
    }
    if (domains.size > 0) {
      return domains
    }
  }

  // 2. Textual detection from patterns and specific tokens
  const tokens = createTokenSet(text)
  for (const def of DOMAIN_DEFINITIONS) {
    let matched = false
    for (const pattern of def.patterns) {
      if (pattern.test(normText) || (normCat && pattern.test(normCat))) {
        domains.add(def.id)
        matched = true
        break
      }
    }

    if (!matched) {
      for (const token of def.tokens) {
        if (tokens.has(token)) {
          domains.add(def.id)
          break
        }
      }
    }
  }

  return domains
}

/*
 * Compare text based on shared keywords.
 */
function calculateSimilarity(newText, savedText) {
  const newTokens = createTokenSet(newText)
  const savedTokens = createTokenSet(savedText)

  if (!newTokens.size || !savedTokens.size) {
    return 0
  }

  let sharedTokens = 0
  newTokens.forEach((token) => {
    if (savedTokens.has(token)) {
      sharedTokens += 1
    }
  })

  const smallerSetSize = Math.min(newTokens.size, savedTokens.size)
  return sharedTokens / smallerSetSize
}

function getSharedTokenDetails(newText, savedText) {
  const newTokens = createTokenSet(newText)
  const savedTokens = createTokenSet(savedText)
  const shared = []
  const genericShared = []
  const specificShared = []

  newTokens.forEach((token) => {
    if (savedTokens.has(token)) {
      shared.push(token)
      if (GENERIC_WORDS.has(token)) {
        genericShared.push(token)
      } else {
        specificShared.push(token)
      }
    }
  })

  return { shared, genericShared, specificShared }
}

function hasAnySignal(tokens, signalSet) {
  for (const token of tokens) {
    if (signalSet.has(token)) return true
  }
  return false
}

/**
 * Robust relevance gate ensuring unrelated problem domains and generic-only
 * overlaps are rejected before scoring.
 */
export function isRelevantBugMatch({
  incomingRuleId,
  savedRuleId,
  incomingDomains,
  savedDomains,
  sharedDomains,
  distinguishingTokens,
  probSim,
  errorSim,
  exactTitleMatch,
  exactErrorMatch,
}) {
  // 1. Same diagnostic rule check
  if (incomingRuleId && savedRuleId && incomingRuleId === savedRuleId) {
    return true
  }

  // 2. Both entries have diagnostic rule IDs, but they differ
  if (incomingRuleId && savedRuleId && incomingRuleId !== savedRuleId) {
    // Only relevant if they belong to the same semantic domain (e.g. node-engine vs missing-nvmrc-or-engines)
    // AND share at least one distinguishing token
    return sharedDomains.size > 0 && distinguishingTokens.length > 0
  }

  // 3. Exact title match
  if (exactTitleMatch) {
    return true
  }

  // 4. If there are NO shared distinguishing tokens, generic-word overlap alone must NEVER match!
  if (distinguishingTokens.length === 0) {
    return false
  }

  // 5. Semantic problem intent and domain when both have identifiable domains
  if (incomingDomains.size > 0 && savedDomains.size > 0) {
    if (sharedDomains.size === 0) {
      // Disjoint domains: strictly unrelated (e.g. license vs node_runtime, license vs env_config, license vs testing, ci vs testing)
      return false
    }
    // They share at least one semantic domain and have distinguishing tokens
    return true
  }

  // 6. One has an identifiable domain and the other does not
  if (incomingDomains.size > 0 || savedDomains.size > 0) {
    if (
      distinguishingTokens.length >= 2 ||
      (distinguishingTokens.length >= 1 && (probSim >= 0.35 || errorSim >= 0.35 || exactErrorMatch))
    ) {
      return true
    }
    return false
  }

  // 7. Neither entry has a standard diagnostic domain (general or custom bugs)
  if (exactErrorMatch) {
    return true
  }

  if (distinguishingTokens.length >= 2) {
    return true
  }

  if (distinguishingTokens.length >= 1 && (probSim >= 0.4 || errorSim >= 0.4)) {
    return true
  }

  return false
}

/*
 * Find previously saved bugs that are meaningfully
 * similar to the current problem.
 */
export function findSimilarBugs({
  problem = '',
  error = '',
  cause = '',
  suggestedFix = '',
  fix = '',
  ruleId = null,
  rule = null,
  category = null,
  source = null,
  bugs = [],
  limit = 6,
}) {
  const incomingFix = suggestedFix || (typeof fix === 'string' ? fix : fix?.snippet || fix?.description || '')
  const currentText = [
    problem,
    error,
    cause,
    incomingFix,
  ]
    .filter(Boolean)
    .join(' ')

  if (!currentText.trim() || !Array.isArray(bugs)) {
    return []
  }

  const incomingRuleId = normalizeText(ruleId || rule || source?.ruleId || source?.diagnosticRule)
  const incomingCategory = normalizeText(category || source?.category)
  const normProblem = normalizeText(problem)
  const normError = normalizeText(error)
  const normCause = normalizeText(cause)

  const incomingTokens = createTokenSet(currentText)
  const incomingHasMissingSignal = hasAnySignal(incomingTokens, MISSING_SIGNALS)
  const incomingHasMismatchSignal = hasAnySignal(incomingTokens, MISMATCH_SIGNALS)
  const incomingDomains = detectSemanticDomains(currentText, incomingRuleId, incomingCategory)

  return bugs
    .map((bug) => {
      const savedRuleId = normalizeText(bug.ruleId || bug.source?.ruleId || bug.source?.diagnosticRule)
      const savedCategory = normalizeText(bug.category || bug.source?.category)
      const savedProblem = normalizeText(bug.problem)
      const savedError = normalizeText(bug.error)
      const savedCause = normalizeText(bug.cause)
      const savedFix = normalizeText(
        bug.suggestedFix || bug.solution || bug.verifiedSolution || bug.fix?.snippet || bug.fix?.description || '',
      )

      const savedCombined = [bug.problem, bug.error, bug.cause, savedFix].filter(Boolean).join(' ')
      const savedTokens = createTokenSet(savedCombined)
      const savedHasMissingSignal = hasAnySignal(savedTokens, MISSING_SIGNALS)
      const savedHasMismatchSignal = hasAnySignal(savedTokens, MISMATCH_SIGNALS)
      const savedDomains = detectSemanticDomains(savedCombined, savedRuleId, savedCategory)

      const sharedDomains = new Set(
        [...incomingDomains].filter((d) => savedDomains.has(d)),
      )

      const { shared, specificShared: distinguishingTokens } = getSharedTokenDetails(
        currentText,
        savedCombined,
      )

      const probSim = calculateSimilarity(problem, bug.problem)
      const errorSim = calculateSimilarity(error, bug.error)
      const causeSim = calculateSimilarity(cause, bug.cause)
      const fixSim = calculateSimilarity(incomingFix, savedFix)
      const combSim = calculateSimilarity(currentText, savedCombined)
      const similarity = Math.max(probSim, errorSim, combSim, (errorSim + fixSim) / 2)

      const exactTitleMatch = Boolean(normProblem && savedProblem && normProblem === savedProblem)
      const sameRuleMatch = Boolean(incomingRuleId && savedRuleId && incomingRuleId === savedRuleId)
      const exactErrorMatch = Boolean(
        normError && savedError && (
          normError === savedError ||
          (normError.length > 15 && savedError.includes(normError)) ||
          (savedError.length > 15 && normError.includes(savedError))
        ),
      )
      const exactCauseMatch = Boolean(normCause && savedCause && normCause === savedCause)

      // 0. Relevance Gate Check
      const isRelevant = isRelevantBugMatch({
        incomingRuleId,
        savedRuleId,
        incomingDomains,
        savedDomains,
        sharedDomains,
        distinguishingTokens,
        probSim,
        errorSim,
        exactTitleMatch,
        exactErrorMatch,
      })

      if (!isRelevant) {
        return null
      }

      // Contradictory intent: e.g. unconfigured requirement vs active runtime incompatibility
      const hasContradictoryIntent = Boolean(
        (incomingHasMissingSignal && !incomingHasMismatchSignal && savedHasMismatchSignal) ||
        (incomingHasMismatchSignal && !savedHasMismatchSignal && savedHasMissingSignal),
      )

      // Shared missing requirement problem (e.g. Node engines/nvmrc missing)
      // Requires problem/error consistency, never fix similarity alone!
      const sharedMissingRequirementProblem = Boolean(
        incomingHasMissingSignal &&
        savedHasMissingSignal &&
        !hasContradictoryIntent &&
        sharedDomains.size > 0 &&
        (
          (distinguishingTokens.includes('engines') ||
           distinguishingTokens.includes('nvmrc') ||
           distinguishingTokens.includes('node') ||
           distinguishingTokens.includes('license') ||
           distinguishingTokens.includes('test')) &&
          (errorSim >= 0.35 || probSim >= 0.35 || exactTitleMatch)
        ),
      )

      let matchLevel
      let badgeLabel
      let matchReason

      if (exactTitleMatch && normError && savedError && errorSim < 0.25) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = 'Related issue: identical title match, but underlying error symptoms differ'
      } else if (exactTitleMatch && normCause && savedCause && causeSim < 0.25) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = 'Related issue: identical title match, but underlying causes differ'
      } else if (hasContradictoryIntent) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = 'Related issue: matching technology area, but runtime incompatibility differs from an unconfigured version requirement'
      } else if (sameRuleMatch && exactErrorMatch) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = `Likely duplicate: same diagnostic check (${incomingRuleId}) with matching error message`
      } else if (exactTitleMatch) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = 'Likely duplicate: exact problem title match'
      } else if (exactErrorMatch && distinguishingTokens.length > 0) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = 'Likely duplicate: matching error message details'
      } else if (exactCauseMatch && normCause.length > 10) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = 'Likely duplicate: exact cause match identified'
      } else if (sharedMissingRequirementProblem) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        if (sharedDomains.has('node_runtime')) {
          matchReason = 'Likely duplicate: matching unconfigured Node.js version report, recommend specifying engines.node'
        } else {
          matchReason = 'Likely duplicate: matching unconfigured requirement report, recommend specifying valid configuration'
        }
      } else if (sharedDomains.size > 0 && (exactErrorMatch || errorSim >= 0.5 || (probSim >= 0.5 && errorSim >= 0.3))) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        const domainDef = DOMAIN_DEFINITIONS.find((d) => sharedDomains.has(d.id))
        const domainLabel = domainDef ? domainDef.label : 'problem'
        matchReason = `Likely duplicate: matching ${domainLabel} issue with consistent error symptoms`
      } else if (sameRuleMatch && distinguishingTokens.length > 0 && similarity >= 0.6) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = `Likely duplicate: same diagnostic check (${incomingRuleId}) with matching symptoms`
      } else if (distinguishingTokens.length >= 2 && similarity >= 0.65 && (errorSim >= 0.35 || causeSim >= 0.35)) {
        matchLevel = 'strong'
        badgeLabel = 'Likely duplicate'
        matchReason = `Likely duplicate: strong match on distinguishing terms (${distinguishingTokens.slice(0, 3).join(', ')})`
      } else if (fixSim >= 0.35 && errorSim < 0.35 && causeSim < 0.35 && probSim < 0.35) {
        // Similar suggested fixes but different underlying issues
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = 'Related issue: matching suggested fixes, but underlying problems and errors differ'
      } else if (sameRuleMatch) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = `Related issue: same diagnostic check (${incomingRuleId}), but symptoms or error details differ; possible match`
      } else if (normCause && savedCause && causeSim < 0.25 && errorSim < 0.25) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = 'Related issue: matching problem area, but underlying causes and solutions differ'
      } else if (distinguishingTokens.length > 0) {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = `Related issue: matching keywords (${distinguishingTokens.slice(0, 4).join(', ')}); verify if cause differs`
      } else {
        matchLevel = 'related'
        badgeLabel = 'Related issue'
        matchReason = `${Math.round(similarity * 100)}% keyword match`
      }

      return {
        bug,
        similarity,
        matchedKeywords: shared,
        specificMatchedKeywords: distinguishingTokens,
        matchLevel,
        badgeLabel,
        matchReason,
      }
    })
    .filter(Boolean)
    .filter((item) => item.similarity >= 0.25)
    .sort((a, b) => {
      if (a.matchLevel === 'strong' && b.matchLevel !== 'strong') return -1
      if (b.matchLevel === 'strong' && a.matchLevel !== 'strong') return 1
      return b.similarity - a.similarity
    })
    .slice(0, limit)
}

export function groupSimilarBugs(matches = []) {
  if (!Array.isArray(matches)) {
    return { likelyDuplicates: [], relatedIssues: [] }
  }
  const likelyDuplicates = matches.filter((item) => item.matchLevel === 'strong')
  const relatedIssues = matches.filter((item) => item.matchLevel === 'related')
  return { likelyDuplicates, relatedIssues }
}
