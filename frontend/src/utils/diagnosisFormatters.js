/**
 * SetupDoctor Diagnosis Formatters and Calculation Helpers
 * Grounded in verified Backend scoring, status, and category contracts.
 */

export const CATEGORIES = [
  'structure',
  'dependencies',
  'config',
  'testing',
  'security',
  'docs',
]

export const CATEGORY_LABELS = {
  structure: 'Structure',
  dependencies: 'Dependencies',
  config: 'Configuration',
  testing: 'Testing',
  security: 'Security',
  docs: 'Documentation',
}

export const GRADE_LABELS = {
  A: 'Healthy',
  B: 'Good',
  C: 'Needs Attention',
  D: 'At Risk',
  F: 'At Risk',
}

export const STATUS_ORDER = {
  error: 1,
  warning: 2,
  info: 3,
  pass: 4,
}

/**
 * Normalizes status strings from various rule conventions.
 */
export function normalizeStatus(rawStatus) {
  const status = String(rawStatus || '').toLowerCase().trim()
  if (status === 'fail' || status === 'error' || status === 'critical') return 'error'
  if (status === 'warn' || status === 'warning') return 'warning'
  if (status === 'info') return 'info'
  if (status === 'pass') return 'pass'
  return 'info'
}

/**
 * Calculates grade from score using verified backend boundaries:
 * A >= 90, B >= 80, C >= 70, D >= 60, F < 60
 */
export function calculateGradeFromScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0) {
    return 'N/A'
  }
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/**
 * Returns the grade, preferring backend-provided grade and falling back to score calculation.
 */
export function getGrade(health) {
  if (health && typeof health.grade === 'string' && health.grade.trim()) {
    return health.grade.trim().toUpperCase()
  }
  if (health && typeof health.score === 'number') {
    return calculateGradeFromScore(health.score)
  }
  return 'N/A'
}

/**
 * Returns health status/label, preferring backend-provided label and falling back to grade mapping.
 */
export function getHealthLabel(health, grade) {
  if (health && typeof health.label === 'string' && health.label.trim()) {
    return health.label.trim()
  }
  if (health && typeof health.status === 'string' && health.status.trim()) {
    return health.status.trim()
  }
  const resolvedGrade = grade || getGrade(health)
  return GRADE_LABELS[resolvedGrade] || 'Unknown'
}

/**
 * Checks whether a category has applicable rules in the diagnostics list.
 */
export function categoryHasApplicableRules(categoryKey, diagnostics = []) {
  if (!Array.isArray(diagnostics)) return false
  return diagnostics.some((d) => {
    const cat = d.category || (d.rule && d.rule.category)
    return cat === categoryKey
  })
}

/**
 * Retrieves category score or null (N/A) if no applicable rules or missing score.
 */
export function getCategoryScore(categoryKey, categoryScores = {}, diagnostics = []) {
  const hasRules = categoryHasApplicableRules(categoryKey, diagnostics)
  if (!hasRules && (!categoryScores || categoryScores[categoryKey] == null)) {
    return null
  }

  if (categoryScores && typeof categoryScores[categoryKey] === 'number') {
    // If backend returns a number but no rules exist for this category, return null to show N/A
    if (!hasRules) {
      return null
    }
    return Math.max(0, Math.min(100, Math.round(categoryScores[categoryKey])))
  }

  return null
}

/**
 * Sorts diagnostics by severity order: Error, Warning, Info, Pass.
 */
export function sortDiagnostics(diagnostics = []) {
  if (!Array.isArray(diagnostics)) return []
  return [...diagnostics].sort((a, b) => {
    const orderA = STATUS_ORDER[normalizeStatus(a.status)] || 99
    const orderB = STATUS_ORDER[normalizeStatus(b.status)] || 99
    if (orderA !== orderB) return orderA - orderB
    const titleA = a.title || a.message || a.rule || ''
    const titleB = b.title || b.message || b.rule || ''
    return titleA.localeCompare(titleB)
  })
}

/**
 * Groups diagnostics by category while preserving severity sort order within each group.
 */
export function groupDiagnosticsByCategory(diagnostics = []) {
  const sorted = sortDiagnostics(diagnostics)
  const groups = new Map()

  // Initialize known categories in order
  for (const cat of CATEGORIES) {
    groups.set(cat, [])
  }

  for (const item of sorted) {
    const cat = item.category || 'other'
    if (!groups.has(cat)) {
      groups.set(cat, [])
    }
    groups.get(cat).push(item)
  }

  // Filter out empty categories
  const result = []
  for (const [key, items] of groups.entries()) {
    if (items.length > 0) {
      result.push({
        key,
        label: CATEGORY_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)),
        items,
      })
    }
  }

  return result
}

/**
 * Calculates filter counts for All, Fail, Warn, Info, Pass.
 */
export function getFilterCounts(diagnostics = []) {
  const counts = { all: 0, fail: 0, warn: 0, info: 0, pass: 0 }
  if (!Array.isArray(diagnostics)) return counts

  for (const item of diagnostics) {
    counts.all += 1
    const st = normalizeStatus(item.status)
    if (st === 'error') counts.fail += 1
    else if (st === 'warning') counts.warn += 1
    else if (st === 'info') counts.info += 1
    else if (st === 'pass') counts.pass += 1
  }

  return counts
}

/**
 * Filters diagnostics by selected severity filter.
 * activeFilter can be: 'all' | 'fail' | 'warn' | 'info' | 'pass'
 */
export function filterDiagnostics(diagnostics = [], activeFilter = 'all') {
  if (!Array.isArray(diagnostics)) return []
  const filter = String(activeFilter || 'all').toLowerCase()
  if (filter === 'all') return diagnostics

  return diagnostics.filter((item) => {
    const st = normalizeStatus(item.status)
    if (filter === 'fail') return st === 'error'
    if (filter === 'warn') return st === 'warning'
    if (filter === 'info') return st === 'info'
    if (filter === 'pass') return st === 'pass'
    return true
  })
}

/**
 * Extracts copyable fix command or snippet. Never invents commands or snippets.
 */
export function getCopyableFix(fix) {
  if (!fix || typeof fix !== 'object') return null

  if (typeof fix.command === 'string' && fix.command.trim().length > 0) {
    return {
      type: 'command',
      content: fix.command.trim(),
      description: typeof fix.description === 'string' ? fix.description.trim() : '',
    }
  }

  if (typeof fix.snippet === 'string' && fix.snippet.trim().length > 0) {
    return {
      type: 'snippet',
      content: fix.snippet.trim(),
      description: typeof fix.description === 'string' ? fix.description.trim() : '',
    }
  }

  return null
}

const INFORMATIONAL_RULES = new Set(['dependency-count', 'environment-documentation'])

/**
 * Derives score breakdown explaining which failed rules lowered the health score.
 * Uses the exact backend scoring logic and denominator:
 * - Filter out info diagnostics and informational rules
 * - Each error costs (100 / total)
 * - Each warning costs (50 / total)
 * - Reconciles with reported health.score
 */
export function calculateScoreBreakdown(diagnostics = [], reportedScore = null) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return { available: false, reason: 'No diagnostic data available' }
  }

  const scoredDiagnostics = diagnostics.filter((diagnostic) => {
    const ruleKey = diagnostic.ruleId || diagnostic.rule
    const st = normalizeStatus(diagnostic.status)
    return (
      st !== 'info' &&
      diagnostic.level !== 'info' &&
      ruleKey !== 'dependency-count' &&
      !(INFORMATIONAL_RULES.has(ruleKey) && diagnostic.message === 'No environment configuration was detected.')
    )
  })

  const total = scoredDiagnostics.length
  if (total === 0) {
    return { available: false, reason: 'No scored diagnostics present' }
  }

  const deductions = []
  let totalDeductionPoints = 0

  for (const item of scoredDiagnostics) {
    const st = normalizeStatus(item.status)
    const ruleKey = item.ruleId || item.rule || 'unknown'
    const title = item.title || item.message || ruleKey

    if (st === 'error') {
      const deduction = 100 / total
      totalDeductionPoints += deduction
      deductions.push({
        ruleId: ruleKey,
        title,
        status: 'error',
        weight: 1,
        deduction: Number(deduction.toFixed(1)),
        rawDeduction: deduction,
      })
    } else if (st === 'warning') {
      const deduction = 50 / total
      totalDeductionPoints += deduction
      deductions.push({
        ruleId: ruleKey,
        title,
        status: 'warning',
        weight: 1,
        deduction: Number(deduction.toFixed(1)),
        rawDeduction: deduction,
      })
    }
  }

  const calculatedScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductionPoints)))
  const effectiveScore = typeof reportedScore === 'number' ? reportedScore : calculatedScore

  return {
    available: true,
    totalScoredChecks: total,
    baseScore: 100,
    deductions,
    totalDeductions: Number(totalDeductionPoints.toFixed(1)),
    calculatedScore,
    effectiveScore,
    reconciled: Math.abs(calculatedScore - effectiveScore) <= 1,
  }
}
