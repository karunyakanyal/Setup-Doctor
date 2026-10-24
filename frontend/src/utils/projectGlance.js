export function formatCapReasonPlainWords(capReason, grade = 'B', dimension = null) {
  if (!capReason || typeof capReason !== 'string') return null
  let text = capReason.trim()
  text = text.replace(/\s*\([a-z0-9_-]+\)/gi, '')
  if (text.startsWith('Capped at')) return text

  if (text.includes(':')) {
    const parts = text.split(':')
    const dim = parts[0].trim()
    const reason = parts.slice(1).join(':').trim()
    const cleanReason = (reason.toLowerCase() === 'missing-tests' || reason.toLowerCase() === 'no-test-script')
      ? 'no automated tests'
      : (reason.toLowerCase() === 'missing-license' ? 'missing license' : reason.toLowerCase())
    return `Capped at ${grade} by ${dim}: ${cleanReason}`
  }

  if (text.includes('cycle')) {
    return `Capped at ${grade || 'B'} by Reliability: ${text}`
  }
  if (text.includes('undeclared')) {
    return `Capped at ${grade || 'C'} by Security: ${text}`
  }
  if (text.includes('secret') || text.includes('vulnerabilit')) {
    return `Capped at ${grade || 'C'} by Security: ${text}`
  }
  if (text.toLowerCase().includes('truncated') || text.toLowerCase().includes('failed')) {
    return `Capped at ${grade || 'B'} by Reliability: ${text}`
  }
  if (text.includes('test')) {
    return `Capped at ${grade || 'C'} by Maintainability: no automated tests`
  }
  const dim = dimension || (grade === 'C' ? 'Maintainability' : 'Reliability')
  return `Capped at ${grade} by ${dim}: ${text.toLowerCase()}`
}

import { normalizeStatus } from './diagnosisFormatters.js'

const KNOWN_CAPITALIZATIONS = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  vite: 'Vite',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  next: 'Next.js',
  nuxt: 'Nuxt',
  nuxtjs: 'Nuxt',
  'nuxt.js': 'Nuxt',
  webpack: 'Webpack',
  eslint: 'ESLint',
  astro: 'Astro',
}

function capitalizeKnownName(name) {
  if (!name) return ''
  const trimmed = String(name).trim()
  const lower = trimmed.toLowerCase()
  return KNOWN_CAPITALIZATIONS[lower] || trimmed
}

/**
 * Format project tech stack in clear, natural words without duplicates.
 * Example: "A React app built with Vite, written in JavaScript"
 */
export function formatStackInPlainWords({
  framework = null,
  stack = [],
  language = null,
  monorepo = false,
  profile = null,
  byLanguage = null,
} = {}) {
  const rawNames = (Array.isArray(stack) ? stack : [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean)

  const seen = new Set()
  const stackNames = []
  for (const name of rawNames) {
    const trimmed = String(name).trim()
    const lower = trimmed.toLowerCase()
    if (lower && !seen.has(lower)) {
      seen.add(lower)
      stackNames.push(capitalizeKnownName(trimmed))
    }
  }

  // Also include stacks from profile if available
  const profileStacks = (Array.isArray(profile?.stacks) ? profile.stacks : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  for (const name of profileStacks) {
    const lower = name.toLowerCase()
    if (lower && !seen.has(lower)) {
      seen.add(lower)
      stackNames.push(capitalizeKnownName(name))
    }
  }

  let cleanFramework = capitalizeKnownName(framework)
  if (!cleanFramework && stackNames.some((s) => /^react$/i.test(s))) {
    cleanFramework = 'React'
  }
  let fwLower = cleanFramework.toLowerCase()

  const hasVite = stackNames.some((s) => /^vite$/i.test(s)) || fwLower === 'vite'
  const hasWebpack = stackNames.some((s) => /^webpack$/i.test(s)) || fwLower === 'webpack'
  const hasNext = stackNames.some((s) => /^next(\.js)?$/i.test(s)) || /^next(\.js)?$/i.test(cleanFramework)
  const hasNuxt = stackNames.some((s) => /^nuxt(\.js)?$/i.test(s)) || /^nuxt(\.js)?$/i.test(cleanFramework)
  const isTypeScript = /^typescript$/i.test(language) || stackNames.some((s) => /^typescript$/i.test(s))
  const isNode = /^node(\.js)?$/i.test(language) || stackNames.some((s) => /^node(\.js)?$/i.test(s))

  // Dominant language derived from real By Language counts if provided
  let langName = 'JavaScript'
  if (byLanguage && typeof byLanguage === 'object') {
    const jsxCount = byLanguage.jsx || 0
    const jsCount = (byLanguage.javascript || 0) + (byLanguage.js || 0)
    const tsxCount = byLanguage.tsx || 0
    const tsCount = (byLanguage.typescript || 0) + (byLanguage.ts || 0)
    const pyCount = (byLanguage.python || 0) + (byLanguage.py || 0)

    const totalTs = tsCount + tsxCount
    const totalJs = jsCount + jsxCount

    if (totalTs > totalJs && totalTs > 0) {
      langName = tsxCount > tsCount ? 'TypeScript (TSX)' : 'TypeScript'
    } else if (totalJs > 0) {
      langName = jsxCount > 0 ? 'JavaScript (JSX)' : 'JavaScript'
    } else if (pyCount > 0) {
      langName = 'Python'
    } else if (isTypeScript) {
      langName = 'TypeScript'
    } else if (isNode) {
      langName = 'Node.js'
    } else if (language) {
      langName = capitalizeKnownName(language)
    }
  } else {
    if (isTypeScript) {
      langName = 'TypeScript'
    } else if (isNode) {
      langName = 'Node.js'
    } else if (language) {
      langName = capitalizeKnownName(language)
    }
  }

  let baseType = 'project'
  if (monorepo) {
    baseType = 'monorepo'
  } else if (hasNext || hasNuxt || cleanFramework) {
    baseType = 'app'
  }

  let frameworkPart = ''
  if (hasNext) {
    frameworkPart = 'Next.js'
  } else if (hasNuxt) {
    frameworkPart = 'Nuxt'
  } else if (cleanFramework) {
    frameworkPart = cleanFramework
  }

  let bundlerPart = ''
  if (hasVite && !hasNext && !hasNuxt && fwLower !== 'vite') {
    bundlerPart = 'built with Vite'
  } else if (hasWebpack && !hasNext && !hasNuxt && fwLower !== 'webpack') {
    bundlerPart = 'built with Webpack'
  }

  // Detect backend / other stacks
  const allLowerStacks = stackNames.map((s) => s.toLowerCase())
  const hasPython = allLowerStacks.some((s) => s.includes('python')) || (byLanguage && (byLanguage.python || 0) > 0)
  const hasFastAPI = allLowerStacks.some((s) => s.includes('fastapi'))
  const hasFlask = allLowerStacks.some((s) => s.includes('flask'))
  const hasDjango = allLowerStacks.some((s) => s.includes('django'))
  const hasExpress = allLowerStacks.some((s) => s.includes('express'))
  const hasGo = allLowerStacks.some((s) => s === 'go' || s === 'golang')
  const hasRust = allLowerStacks.some((s) => s === 'rust')

  let backendPart = ''
  if (hasPython && hasFastAPI) {
    backendPart = 'Python (FastAPI) backend'
  } else if (hasPython && hasFlask) {
    backendPart = 'Python (Flask) backend'
  } else if (hasPython && hasDjango) {
    backendPart = 'Python (Django) backend'
  } else if (hasPython && !langName.startsWith('Python')) {
    backendPart = 'Python backend'
  } else if (hasExpress && fwLower !== 'express') {
    backendPart = 'Node.js (Express) backend'
  } else if (hasGo) {
    backendPart = 'Go backend'
  } else if (hasRust) {
    backendPart = 'Rust backend'
  }

  let description
  if (monorepo) {
    const candidateTools = [
      frameworkPart,
      (hasVite && fwLower !== 'vite') ? 'Vite' : '',
      (hasWebpack && fwLower !== 'webpack') ? 'Webpack' : '',
    ].filter(Boolean)

    const toolSeen = new Set()
    const uniqueTools = []
    for (const t of candidateTools) {
      const lower = t.toLowerCase()
      if (!toolSeen.has(lower)) {
        toolSeen.add(lower)
        uniqueTools.push(capitalizeKnownName(t))
      }
    }
    const toolsStr = uniqueTools.join(' and ')
    description = toolsStr
      ? `A ${langName} monorepo using ${toolsStr}`
      : `A ${langName} monorepo`
  } else if (frameworkPart && bundlerPart) {
    description = `A ${frameworkPart} ${baseType} ${bundlerPart}, written in ${langName}`
  } else if (frameworkPart) {
    description = `A ${frameworkPart} ${baseType}, written in ${langName}`
  } else if (bundlerPart) {
    description = `A ${langName} ${baseType} ${bundlerPart}`
  } else {
    description = `A ${langName} ${baseType}`
  }

  if (backendPart) {
    description += `, with a ${backendPart}`
  }

  // Capitalize known names in the sentence (React, Vue, Svelte, Vite, TypeScript, JavaScript, Node.js)
  description = description.replace(
    /\b(react|vue|svelte|vite|typescript|javascript|node\.js)\b/gi,
    (match) => capitalizeKnownName(match),
  )

  return description
}

/**
 * Derive health verdict (icon, text, tone/color, one-sentence why) from combined data:
 * diagnostics + graph summary (production counts only, respecting toggle state).
 */
/**
 * Repository Health Score & Grade Formula
 *
 * One formula to derive unified score and grade from whole-repo production rules:
 *
 * 1. Base Score: 100 points.
 * 2. Deductions based on rule violations and severity:
 *    - 'critical' (runtime cycles, undeclared packages):
 *      Base deduction of 2.5 points for the first violation + 0.5 points per additional violation (max 8 points per rule).
 *    - 'important' (unresolved imports, orphan files, missing tests):
 *      Base deduction of 2.0 points for the first violation + 0.5 points per additional violation (max 5 points per rule).
 *    - 'nice-to-have' (unused dependencies, missing license, missing engines field):
 *      Base deduction of 1.0 point for the first violation + 0.1 points per additional violation (max 2 points per rule).
 *
 * 3. Raw Score & Grade:
 *    rawScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)))
 *    rawGrade = calculateGrade(rawScore):
 *      A: >= 90, B: >= 80, C: >= 70, D: >= 60, F: < 60
 *
 * 4. Grade Caps:
 *    Caps prevent a repository with real production problems from showing a high grade:
 *    - Any undeclared package or failed critical diagnostic -> max grade C (and score capped at max 79).
 *      capReason: `${count} undeclared ${count === 1 ? 'package' : 'packages'}` (or 'failed critical diagnostic').
 *    - Any runtime cycle -> max grade B (and score capped at max 89).
 *      capReason: `${count} runtime ${count === 1 ? 'cycle' : 'cycles'}`.
 *    - Truncated or failed Code Map scan -> max grade B (and score capped at max 89).
 *      capReason: truncated ? 'Code Map scan truncated' : 'Code Map scan failed'.
 *    - Otherwise: no cap, capReason is null.
 *
 * Returns { score, grade, capReason, rawScore, rawGrade }.
 */
export function calculateScoreAndGrade(rules = [], options = {}) {
  const rulesMap = new Map()
  for (const r of rules) {
    if (r && r.id) rulesMap.set(r.id, r)
  }

  let totalDeductions = 0
  for (const rule of rules) {
    if (!rule || typeof rule.count !== 'number' || rule.count <= 0) continue

    if (rule.severity === 'critical') {
      const deduction = 2.5 + Math.min(5.5, (rule.count - 1) * 0.5)
      totalDeductions += deduction
    } else if (rule.severity === 'important') {
      const deduction = 2.0 + Math.min(3.0, (rule.count - 1) * 0.5)
      totalDeductions += deduction
    } else {
      // nice-to-have
      const deduction = 1.0 + Math.min(1.0, (rule.count - 1) * 0.1)
      totalDeductions += deduction
    }
  }

  const rawScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)))
  let rawGrade = 'F'
  if (rawScore >= 90) rawGrade = 'A'
  else if (rawScore >= 80) rawGrade = 'B'
  else if (rawScore >= 70) rawGrade = 'C'
  else if (rawScore >= 60) rawGrade = 'D'

  const undeclaredRule = rulesMap.get('undeclared-packages')
  const undeclaredCount = undeclaredRule ? undeclaredRule.count : 0

  const runtimeCyclesRule = rulesMap.get('runtime-cycles')
  const runtimeCyclesCount = runtimeCyclesRule ? runtimeCyclesRule.count : 0

  const hasFailedCriticalDiag = Boolean(options.hasFailedCriticalDiagnostic)
  const isTruncated = Boolean(options.truncated)
  const isFailedScan = Boolean(options.failed)

  let finalGrade = rawGrade
  let finalScore = rawScore
  let capReason = null

  if (undeclaredCount > 0 || hasFailedCriticalDiag) {
    if (finalGrade === 'A' || finalGrade === 'B' || finalGrade === 'C') {
      finalGrade = 'C'
      finalScore = Math.min(finalScore, 79)
      capReason = undeclaredCount > 0
        ? `Capped at C by Security: ${undeclaredCount} undeclared ${undeclaredCount === 1 ? 'package' : 'packages'}`
        : 'Capped at C by Reliability: failed critical diagnostic'
    }
  } else if (runtimeCyclesCount > 0) {
    if (finalGrade === 'A' || finalGrade === 'B') {
      finalGrade = 'B'
      finalScore = Math.min(finalScore, 89)
      capReason = `Capped at B by Reliability: ${runtimeCyclesCount} runtime ${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'}`
    }
  } else if (isTruncated || isFailedScan) {
    if (finalGrade === 'A' || finalGrade === 'B') {
      finalGrade = 'B'
      finalScore = Math.min(finalScore, 89)
      capReason = isTruncated ? 'Code Map scan truncated' : 'Code Map scan failed'
    }
  }

  return {
    score: finalScore,
    grade: finalGrade,
    capReason,
    rawScore,
    rawGrade,
  }
}

/**
 * Derive health verdict (icon, text, tone/color, one-sentence why) from combined data:
 * diagnostics + graph summary (production counts only, respecting toggle state).
 */
export function getHealthVerdict({
  health = null,
  diagnostics = [],
  deepScanData = null,
  deepScanStatus = 'idle',
  includeNonProd = false,
} = {}) {
  const prodErrors = diagnostics.filter((d) => normalizeStatus(d.status) === 'error').length
  const prodWarnings = diagnostics.filter((d) => normalizeStatus(d.status) === 'warning').length

  // 1. While the graph is still loading:
  if (deepScanStatus === 'scanning') {
    let verdict = 'Scanning code...'
    let icon = '⏳'
    let tone = 'healthy'
    let whySentence = 'Setup checks passed. Scanning code for circular dependencies and imports...'

    if (prodErrors > 0) {
      verdict = 'Needs attention'
      icon = '✖'
      tone = 'attention'
      whySentence = `${prodErrors} critical setup ${prodErrors === 1 ? 'issue was' : 'issues were'} found. Scanning code for circular dependencies and imports...`
    } else if (prodWarnings > 0) {
      verdict = 'A few things to fix'
      icon = '⚠'
      tone = 'warning'
      whySentence = `${prodWarnings} setup ${prodWarnings === 1 ? 'warning was' : 'warnings were'} found. Scanning code for circular dependencies and imports...`
    }

    return {
      label: verdict,
      icon,
      tone,
      score: null,
      grade: null,
      capReason: null,
      gradeText: null,
      showScore: false,
      whySentence,
      counts: {
        critical: prodErrors,
        warnings: prodWarnings,
        runtimeCycles: 0,
        undeclared: 0,
        unused: 0,
        orphans: 0,
        unresolved: 0,
        totalIssues: prodErrors + prodWarnings,
      },
    }
  }

  // 2. If the graph scan fails or is unavailable:
  const isGraphUnavailable = deepScanStatus === 'error' || (!deepScanData && deepScanStatus !== 'scanning')
  if (isGraphUnavailable) {
    const fallbackScore = typeof health?.score === 'number'
      ? health.score
      : (prodErrors > 0 ? 60 : (prodWarnings > 0 ? 80 : 100))

    let grade = health?.grade || (fallbackScore >= 90 ? 'A' : fallbackScore >= 80 ? 'B' : fallbackScore >= 70 ? 'C' : 'D')
    let score = fallbackScore
    let capReason = health?.capReason || null

    if (prodErrors > 0) {
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        grade = 'C'
        score = Math.min(score, 79)
        capReason = 'failed critical diagnostic'
      }
    } else if (deepScanStatus === 'error') {
      if (grade === 'A' || grade === 'B') {
        grade = 'B'
        score = Math.min(score, 89)
        capReason = 'Code Map scan failed'
      }
    }

    let verdict
    let icon
    let tone

    if (grade === 'D' || grade === 'E' || grade === 'F') {
      verdict = 'Needs attention'
      icon = '✖'
      tone = 'attention'
    } else if (grade === 'B' || grade === 'C') {
      verdict = 'A few things to fix'
      icon = '⚠'
      tone = 'warning'
    } else {
      verdict = 'Looking healthy'
      icon = '✓'
      tone = 'healthy'
    }

    const whySentence = 'Code Map unavailable, so this verdict covers setup checks only.'
    const gradeText = grade ? (capReason ? `Grade ${grade} (capped: ${capReason})` : `Grade ${grade}`) : null

    return {
      label: verdict,
      icon,
      tone,
      score,
      grade,
      capReason,
      gradeText,
      showScore: true,
      whySentence,
      counts: {
        critical: prodErrors,
        warnings: prodWarnings,
        runtimeCycles: 0,
        undeclared: 0,
        unused: 0,
        orphans: 0,
        unresolved: 0,
        totalIssues: prodErrors + prodWarnings,
      },
    }
  }

  // 3. Graph data available - compute combined production metrics (respecting toggle state)
  let cyclesList = deepScanData?.summary?.cycles || deepScanData?.cycles || []
  if (includeNonProd) {
    if (deepScanData?.summary?.allCycles) {
      cyclesList = deepScanData.summary.allCycles
    } else if (deepScanData?.summary?.nonProdCycles) {
      cyclesList = [...cyclesList, ...deepScanData.summary.nonProdCycles]
    }
  }
  const runtimeCycles = cyclesList.filter((c) => !c?.isTypeOnly)
  const runtimeCyclesCount = includeNonProd
    ? (runtimeCycles.length + (deepScanData?.summary?.nonProduction?.cycles || 0))
    : runtimeCycles.length

  const undeclaredList = deepScanData?.summary?.usedButUndeclared || deepScanData?.usedButUndeclared || []
  const undeclaredCount = includeNonProd
    ? (undeclaredList.length + (deepScanData?.summary?.nonProduction?.usedButUndeclared || 0))
    : undeclaredList.length

  const orphansList = deepScanData?.summary?.orphans || deepScanData?.orphans || []
  const orphansCount = includeNonProd
    ? (orphansList.length + (deepScanData?.summary?.nonProduction?.orphans || 0))
    : orphansList.length

  const unusedList = deepScanData?.summary?.declaredButUnused || deepScanData?.declaredButUnused || []
  const unusedCount = includeNonProd
    ? (unusedList.length + (deepScanData?.summary?.nonProduction?.declaredButUnused || 0))
    : unusedList.length

  const rawUnresolved = deepScanData?.unresolvedImports || deepScanData?.summary?.unresolvedImports || []
  let unresolvedCount
  if (includeNonProd) {
    unresolvedCount = deepScanData?.summary?.unresolvedCount ?? deepScanData?.unresolvedCount ?? rawUnresolved.length
  } else {
    if (rawUnresolved.length > 0) {
      unresolvedCount = rawUnresolved.filter((i) => i.category !== 'non-production').length
    } else if (deepScanData?.summary?.unresolvedByReason) {
      const ubr = deepScanData.summary.unresolvedByReason
      unresolvedCount =
        (ubr['relative-not-found'] || 0) +
        (ubr['directory-index-not-found'] || 0) +
        (ubr['alias-unresolved'] || 0) +
        (ubr['package-imports-unresolved'] || 0) +
        (ubr['other'] || 0)
    } else {
      const nonProdUnresolved = deepScanData?.summary?.nonProduction?.unresolved || 0
      unresolvedCount = Math.max(0, (deepScanData?.summary?.unresolvedCount ?? deepScanData?.unresolvedCount ?? 0) - nonProdUnresolved)
    }
  }

  const hasMissingLicense = diagnostics.some((d) => d.rule === 'missing-license' && normalizeStatus(d.status) !== 'pass')
  const hasMissingEngines = diagnostics.some((d) => (d.rule === 'node-engine' || d.rule === 'missing-nvmrc-or-engines') && normalizeStatus(d.status) !== 'pass')
  const hasMissingTests = diagnostics.some((d) => (d.rule === 'missing-test-script' || d.rule === 'missing-tests') && normalizeStatus(d.status) !== 'pass')

  const isTruncated = Boolean(deepScanData?.truncated || deepScanData?.coverage?.truncated)
  const isFailedScan = deepScanStatus === 'error'

  const rules = deepScanData?.summary?.rules || deepScanData?.rules || [
    { id: 'runtime-cycles', severity: 'critical', count: runtimeCyclesCount },
    { id: 'orphans', severity: 'important', count: orphansCount },
    { id: 'undeclared-packages', severity: 'critical', count: undeclaredCount },
    { id: 'unresolved-imports', severity: 'important', count: unresolvedCount },
    { id: 'unused-dependencies', severity: 'nice-to-have', count: unusedCount },
    { id: 'missing-license', severity: 'nice-to-have', count: hasMissingLicense ? 1 : 0 },
    { id: 'missing-engines-field', severity: 'nice-to-have', count: hasMissingEngines ? 1 : 0 },
    { id: 'missing-tests', severity: 'important', count: hasMissingTests ? 1 : 0 },
  ]

  const scoreResult = calculateScoreAndGrade(rules, {
    hasFailedCriticalDiagnostic: prodErrors > 0,
    truncated: isTruncated,
    failed: isFailedScan,
  })

  let finalScore = scoreResult.score
  let finalGrade = scoreResult.grade
  let capReason = scoreResult.capReason

  const hasGraphFindings =
    runtimeCyclesCount > 0 ||
    orphansCount > 0 ||
    unresolvedCount > 0 ||
    undeclaredCount > 0 ||
    unusedCount > 0

  if (typeof deepScanData?.score === 'number' && typeof deepScanData?.grade === 'string') {
    finalScore = deepScanData.score
    finalGrade = deepScanData.grade
    capReason = deepScanData.capReason || null
  }

  const dimensions = deepScanData?.dimensions || deepScanData?.summary?.dimensions
  if (dimensions?.overallGrade) {
    finalGrade = dimensions.overallGrade
    if (dimensions.capReason) {
      capReason = dimensions.capReason
    }
  }

  const findingsList = deepScanData?.findings || deepScanData?.summary?.findings || []
  const hasSecrets = findingsList.some((f) => f.id === 'committed-secrets' || f.id === 'env-tracked')
  const hasCriticalVulns = findingsList.some((f) => f.id === 'known-vulnerabilities' && f.severity === 'critical')
  if (hasSecrets || hasCriticalVulns) {
    if (finalGrade === 'A' || finalGrade === 'B' || finalGrade === 'C') {
      finalGrade = 'C'
      finalScore = Math.min(finalScore, 79)
      capReason = hasSecrets ? 'committed secrets found' : 'known critical vulnerabilities'
    }
  } else if (
    !hasGraphFindings &&
    !isTruncated &&
    !isFailedScan &&
    typeof health?.score === 'number' &&
    typeof deepScanData?.score !== 'number' &&
    !deepScanData?.summary?.rules
  ) {
    finalScore = health.score
    finalGrade = finalScore >= 90 ? 'A' : (finalScore >= 80 ? 'B' : (finalScore >= 70 ? 'C' : 'D'))
    capReason = health?.capReason || null
  }

  // Enforce grade caps:
  if (undeclaredCount > 0 || prodErrors > 0) {
    if (finalGrade === 'A' || finalGrade === 'B' || finalGrade === 'C') {
      finalGrade = 'C'
      finalScore = Math.min(finalScore, 79)
      capReason = undeclaredCount > 0
        ? `${undeclaredCount} undeclared ${undeclaredCount === 1 ? 'package' : 'packages'}`
        : 'failed critical diagnostic'
    }
  } else if (runtimeCyclesCount > 0) {
    if (finalGrade === 'A' || finalGrade === 'B') {
      finalGrade = 'B'
      finalScore = Math.min(finalScore, 89)
      capReason = `${runtimeCyclesCount} runtime ${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'}`
    }
  } else if (isTruncated || isFailedScan) {
    if (finalGrade === 'A' || finalGrade === 'B') {
      finalGrade = 'B'
      finalScore = Math.min(finalScore, 89)
      capReason = isTruncated ? 'Code Map scan truncated' : 'Code Map scan failed'
    }
  }


  // Verdict rules (production only):
  // - Needs attention: any failed critical diagnostic, or >= 1 undeclared package, or grade C/D/F.
  // - A few things to fix: any runtime cycle, orphan, unresolved import, unused dependency,
  //   any non-passing diagnostic, truncated scan, or grade B.
  // - Looking healthy: none of the above (grade A).
  let verdict
  let icon
  let tone

  // Verdict mapping: A = "Looking healthy", B and C = "A few things to fix", D and E = "Needs attention"
  if (finalGrade === 'D' || finalGrade === 'E' || finalGrade === 'F') {
    verdict = 'Needs attention'
    icon = '✖'
    tone = 'attention'
  } else if (finalGrade === 'B' || finalGrade === 'C') {
    verdict = 'A few things to fix'
    icon = '⚠'
    tone = 'warning'
  } else {
    verdict = 'Looking healthy'
    icon = '✓'
    tone = 'healthy'
  }

  // The one-line reason must list the real counts.
  const parts = []
  if (runtimeCyclesCount > 0) {
    parts.push(`${runtimeCyclesCount} circular ${runtimeCyclesCount === 1 ? 'dependency' : 'dependencies'}`)
  }
  if (orphansCount > 0) {
    parts.push(`${orphansCount} orphan ${orphansCount === 1 ? 'file' : 'files'}`)
  }
  if (unresolvedCount > 0) {
    parts.push(`${unresolvedCount} unresolved ${unresolvedCount === 1 ? 'import' : 'imports'}`)
  }
  if (undeclaredCount > 0) {
    parts.push(`${undeclaredCount} undeclared ${undeclaredCount === 1 ? 'package' : 'packages'}`)
  }
  if (unusedCount > 0) {
    parts.push(`${unusedCount} unused ${unusedCount === 1 ? 'dependency' : 'dependencies'}`)
  }
  if (prodErrors > 0) {
    parts.push(`${prodErrors} critical setup ${prodErrors === 1 ? 'issue' : 'issues'}`)
  }
  if (prodWarnings > 0) {
    parts.push(`${prodWarnings} setup ${prodWarnings === 1 ? 'warning' : 'warnings'}`)
  }
  if (isTruncated && parts.length === 0) {
    parts.push('truncated scan')
  }

  let whySentence
  if (parts.length === 0) {
    whySentence = 'All setup checks passed with no circular dependencies or missing packages.'
  } else if (parts.length === 1) {
    const single = parts[0]
    const verb = single.startsWith('1 ') ? 'was' : 'were'
    whySentence = `${single} ${verb} found.`
  } else if (parts.length === 2) {
    whySentence = `Found ${parts[0]} and ${parts[1]}.`
  } else {
    whySentence = `Found ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`
  }

  // Compute summary line from merged findings: e.g. "1 critical, 2 important, 6 nice-to-have", never "5 setup warnings"
  const mergedForSummary = buildMergedFindings({ diagnostics, deepScanData, includeNonProd })
  const critCount = mergedForSummary.filter((f) => f.severity === 'critical').length
  const impCount = mergedForSummary.filter((f) => f.severity === 'important').length
  const niceCount = mergedForSummary.filter((f) => f.severity === 'nice-to-have').length
  const sumParts = []
  if (critCount > 0) sumParts.push(`${critCount} critical`)
  if (impCount > 0) sumParts.push(`${impCount} important`)
  if (niceCount > 0) sumParts.push(`${niceCount} nice-to-have`)
  const summaryLine = sumParts.length > 0 ? sumParts.join(', ') : 'All checks passed with no issues found.'

  return {
    label: verdict,
    icon,
    tone,
    score: finalScore,
    grade: finalGrade,
    capReason: formatCapReasonPlainWords(capReason, finalGrade),
    gradeText: formatCapReasonPlainWords(capReason, finalGrade) || (finalGrade ? `Grade ${finalGrade}` : null),
    showScore: true,
    summaryLine,
    whySentence,
    counts: {
      critical: prodErrors + undeclaredCount,
      warnings: prodWarnings,
      runtimeCycles: runtimeCyclesCount,
      undeclared: undeclaredCount,
      unused: unusedCount,
      orphans: orphansCount,
      unresolved: unresolvedCount,
      totalIssues: parts.length,
    },
  }
}

/**
 * Build ordered next steps from diagnostics, fix suggestions, runtime cycles, undeclared deps,
 * unresolved imports, orphans, and unused deps. Max 3 shown by default, ordered by severity.
 */
export function getWhatToDoNext({
  diagnostics = [],
  deepScanData = null,
  deepScanStatus = 'idle',
  includeNonProd = false,
} = {}) {
  if (deepScanStatus === 'scanning') {
    return [{
      id: 'scanning-step',
      severity: 'Scanning',
      isZeroState: true,
      title: 'Scanning code in progress...',
      why: 'We are analyzing repository structure, imports, and dependencies.',
      action: null,
    }]
  }

  const merged = buildMergedFindings({
    diagnostics,
    deepScanData,
    includeNonProd,
  })

  if (merged.length === 0) {
    return [{
      id: 'all-clear',
      severity: 'Info',
      isZeroState: true,
      title: 'Nothing to fix right now',
      why: 'All whole-repository checks and diagnostic rules passed cleanly.',
      action: {
        type: 'command',
        value: 'npm outdated',
        label: 'Run npm outdated periodically to check for dependency updates.',
      },
    }]
  }

  const formatSeverity = (sev) => {
    if (!sev) return 'Important'
    const s = String(sev).toLowerCase().replace(/\s+/g, '-')
    if (s === 'critical') return 'Critical'
    if (s === 'important') return 'Important'
    if (s === 'nice-to-have') return 'Nice to have'
    if (s === 'info') return 'Info'
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return merged.map((finding, idx) => ({
    id: finding.id || `step-${idx}`,
    severity: formatSeverity(finding.severity),
    title: finding.fixTitle || finding.name,
    why: finding.why,
    action: finding.action || (finding.fix ? { type: 'command', value: finding.fix, label: finding.fix } : null),
  }))
}

export function isCoveredTopic(ruleId) {
  if (!ruleId) return false
  const r = String(ruleId).toLowerCase()
  return (
    r.includes('test') ||
    r.includes('engine') ||
    r.includes('nvmrc') ||
    r.includes('node-version') ||
    r.includes('ci') ||
    r.includes('license') ||
    r.includes('security') ||
    r.includes('lockfile') ||
    r.includes('outdated') ||
    r.includes('cycle') ||
    r.includes('undeclared') ||
    r.includes('orphan') ||
    r.includes('unresolved') ||
    r.includes('unused')
  )
}

/**
 * Builds a unified list of findings by merging diagnostic checks and rule findings by topic.
 * Each issue appears ONCE, with rule evidence and the rule's why and fix.
 */
export function buildMergedFindings({
  diagnostics = [],
  deepScanData = null,
  includeNonProd = false,
} = {}) {
  const merged = []
  const coveredTopics = new Set()

  const rawFindings = Array.isArray(deepScanData?.findings)
    ? deepScanData.findings
    : Array.isArray(deepScanData?.summary?.findings)
    ? deepScanData.summary.findings
    : []

  const diagMap = new Map()
  for (const d of diagnostics) {
    const key = (d.rule || d.ruleId || '').toLowerCase()
    if (key) diagMap.set(key, d)
  }

  const rawMap = new Map()
  for (const f of rawFindings) {
    if (f?.id) rawMap.set(f.id.toLowerCase(), f)
  }

  // 1. RUNTIME CYCLES (Critical)
  let cycles = deepScanData?.summary?.cycles || deepScanData?.cycles || []
  if (includeNonProd) {
    if (deepScanData?.summary?.allCycles) {
      cycles = deepScanData.summary.allCycles
    } else if (deepScanData?.summary?.nonProdCycles) {
      cycles = [...cycles, ...deepScanData.summary.nonProdCycles]
    }
  }
  const runtimeCycles = cycles.filter((c) => !c?.isTypeOnly)
  if (runtimeCycles.length > 0) {
    coveredTopics.add('cycles')
    for (let idx = 0; idx < runtimeCycles.length; idx++) {
      const cycle = runtimeCycles[idx]
      const files = Array.isArray(cycle) ? cycle : (cycle?.files || [])
      const shortest = (Array.isArray(cycle?.shortest) && cycle.shortest.length > 0)
        ? cycle.shortest
        : files
      const loopStr = (shortest.length > 1 && shortest[0] !== shortest[shortest.length - 1])
        ? [...shortest, shortest[0]].join(' → ')
        : shortest.join(' → ')
      const targetFile = shortest[0] || files[0] || 'cycle'

      const hub = cycle?.hub || (deepScanData?.summary?.cycles && deepScanData.summary.cycles[idx]?.hub) || deepScanData?.summary?.hub || null
      let cycleWhy = 'Circular imports cause tight coupling and can evaluate modules before their exports are initialized.'
      let cycleFix
      const nFiles = hub?.totalFilesInCycle || files.length || shortest.length || 2
      if (hub && hub.file && hub.symbol && hub.count) {
        cycleWhy = `${hub.count} files import ${hub.symbol} from ${hub.file}.`
        cycleFix = `Move ${hub.symbol} to a new file (e.g. ${hub.suggestedFile || 'src/context/AppContext.jsx'}); this one change breaks the loop through all ${nFiles} files.`
      } else {
        cycleFix = `Refactor ${targetFile} or extract shared types/functions into a separate module; this one change breaks the loop through all ${nFiles} files.`
      }

      // Evidence: real import lines, never placeholders like "cycle step 1"
      let cycleEv = []
      if (Array.isArray(cycle?.evidence) && cycle.evidence.length > 0) {
        cycleEv = cycle.evidence
      } else {
        for (let i = 0; i < shortest.length; i++) {
          const from = shortest[i]
          const to = shortest[(i + 1) % shortest.length]
          cycleEv.push({
            file: from,
            line: 1,
            snippet: `import from '${to}'`,
          })
        }
      }

      merged.push({
        id: `runtime-cycle-${idx}`,
        topic: 'cycles',
        name: `Runtime Circular Dependency: ${loopStr}`,
        fixTitle: `Break circular dependency: ${loopStr}`,
        severity: 'critical',
        dimension: 'reliability',
        why: cycleWhy,
        fix: cycleFix,
        evidence: cycleEv,
        count: 1,
        action: {
          type: 'file',
          value: targetFile,
          label: `Inspect ${targetFile}`,
        },
        docsUrl: 'https://nodejs.org/api/modules.html#cycles',
      })
    }
  }

  // 2. UNDECLARED PACKAGES (Critical)
  const undeclared = deepScanData?.summary?.usedButUndeclared || deepScanData?.usedButUndeclared || []
  if (undeclared.length > 0) {
    coveredTopics.add('undeclared')
    const undeclaredSources = deepScanData?.summary?.undeclaredSources || {}
    for (const pkg of undeclared) {
      const srcFiles = undeclaredSources[pkg] || []
      merged.push({
        id: `undeclared-${pkg}`,
        topic: 'undeclared',
        name: `Undeclared package "${pkg}"`,
        fixTitle: `Install undeclared package "${pkg}"`,
        severity: 'critical',
        dimension: 'security',
        why: `Imported in source code but not declared in package.json dependencies. Will break in clean installs and CI.`,
        fix: `npm install ${pkg}`,
        evidence: srcFiles.length > 0
          ? srcFiles.map((f) => ({ file: f, line: 1, snippet: `import ... from '${pkg}'` }))
          : [{ file: 'package.json', line: 1, snippet: `Missing dependency: ${pkg}` }],
        count: 1,
        action: {
          type: 'command',
          value: `npm install ${pkg}`,
          label: `npm install ${pkg}`,
        },
        docsUrl: 'https://docs.npmjs.com/cli/v10/commands/npm-install',
      })
    }
  }

  // 3. UNRESOLVED IMPORTS (Important)
  const rawUnresolved = deepScanData?.unresolvedImports || deepScanData?.summary?.unresolvedImports || []
  const unresolvedList = includeNonProd ? rawUnresolved : rawUnresolved.filter((item) => item.category !== 'non-production')
  if (unresolvedList.length > 0) {
    coveredTopics.add('unresolved')
    for (let i = 0; i < unresolvedList.length; i++) {
      const item = unresolvedList[i]
      const spec = item.specifier || item.target || 'module'
      const from = item.from || item.file || 'source'
      merged.push({
        id: `unresolved-${i}-${from}-${spec}`,
        topic: 'unresolved',
        name: `Unresolved import "${spec}" in ${from}`,
        fixTitle: `Resolve missing import "${spec}" in ${from}`,
        severity: 'important',
        dimension: 'reliability',
        why: `Import "${spec}" in ${from} could not be resolved to any file or package.`,
        fix: `Fix the relative import path in ${from} or install the package.`,
        evidence: [{ file: from, line: 1, snippet: `import '${spec}'` }],
        count: 1,
        action: {
          type: 'file',
          value: from,
          label: `Inspect ${from}`,
        },
        docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import',
      })
    }
  }

  // 4. TESTS (Important) - Merge missing-tests, no-test-script, low-test-ratio into one "No automated tests"
  const testDiagFailing = [
    diagMap.get('missing-test-script'),
    diagMap.get('no-test-script'),
    diagMap.get('missing-tests'),
    diagMap.get('low-test-ratio'),
  ].filter((d) => d && normalizeStatus(d.status) !== 'pass')

  const noTestScriptRaw = rawMap.get('no-test-script')
  const lowRatioRaw = rawMap.get('low-test-ratio')
  const missingTestsRaw = rawMap.get('missing-tests')
  const testRawFailing = [noTestScriptRaw, lowRatioRaw, missingTestsRaw].filter((r) => r && r.count > 0)

  if (testDiagFailing.length > 0 || testRawFailing.length > 0) {
    coveredTopics.add('tests')
    const primaryTest = testRawFailing[0] || testDiagFailing[0]
    merged.push({
      id: 'no-automated-tests',
      topic: 'tests',
      name: 'No automated tests',
      fixTitle: 'Add automated tests and test script',
      severity: 'important',
      dimension: 'maintainability',
      why: 'package.json does not define a runnable "test" script and no automated test files were found, so regressions must be caught manually.',
      fix: 'Add a "test" script in package.json (e.g. "test": "vitest run" or "npm test") and write automated tests.',
      evidence: primaryTest?.evidence?.length > 0
        ? primaryTest.evidence
        : [{ file: 'package.json', line: 1, snippet: 'Missing "test" script in package.json' }],
      count: 1,
      action: {
        type: 'command',
        value: 'npm pkg set scripts.test="node --test"',
        label: 'npm pkg set scripts.test="node --test"',
      },
      docsUrl: 'https://docs.npmjs.com/cli/v10/using-npm/scripts',
    })
  }

  // 5. NODE VERSION - Merge "Node.js Engine Requirement" and "Node.js Version Pinning"
  const nodeDiagFailing = [
    diagMap.get('node-engine'),
    diagMap.get('missing-nvmrc-or-engines'),
    diagMap.get('engines-status'),
  ].filter((d) => d && normalizeStatus(d.status) !== 'pass')

  const nodeRawFailing = [
    rawMap.get('missing-engines-field'),
    rawMap.get('node-version-mismatch'),
  ].filter((r) => r && r.count > 0)

  if (nodeDiagFailing.length > 0 || nodeRawFailing.length > 0) {
    coveredTopics.add('node-version')
    const hasMismatch = rawMap.get('node-version-mismatch')?.count > 0
    merged.push({
      id: 'node-version-requirement',
      topic: 'node-version',
      name: 'Node.js Version Requirement and Pinning',
      fixTitle: 'Pin Node.js version in package.json engines and .nvmrc',
      severity: hasMismatch ? 'important' : 'nice-to-have',
      dimension: 'reliability',
      why: hasMismatch
        ? 'Node version declarations conflict across configuration files.'
        : 'package.json lacks an "engines.node" field and .nvmrc is missing to pin the Node.js runtime version.',
      fix: 'Add "engines": { "node": ">=20.0.0" } to package.json and create a .nvmrc file with your Node version.',
      evidence: hasMismatch
        ? [{ file: '.nvmrc', line: 1, snippet: 'Node version mismatch' }]
        : [{ file: 'package.json', line: 1, snippet: 'Missing engines.node requirement' }],
      count: 1,
      action: {
        type: 'command',
        value: 'echo "v20" > .nvmrc',
        label: 'Create .nvmrc',
      },
      docsUrl: 'https://nodejs.org/en/about/previous-releases',
    })
  }

  // 6. ORPHANS (Important)
  const orphans = deepScanData?.summary?.orphans || deepScanData?.orphans || []
  if (orphans.length > 0) {
    coveredTopics.add('orphans')
    for (const orphan of orphans) {
      merged.push({
        id: `orphan-${orphan}`,
        topic: 'orphans',
        name: `Orphan file "${orphan}"`,
        fixTitle: `Review orphan file "${orphan}"`,
        severity: 'important',
        dimension: 'maintainability',
        why: `Never imported by any file in the repository. May be dead code increasing maintenance burden.`,
        fix: `Import ${orphan} or delete the file if no longer needed.`,
        evidence: [{ file: orphan, line: 1, snippet: '0 incoming imports (orphan file)' }],
        count: 1,
        action: {
          type: 'file',
          value: orphan,
          label: `Inspect ${orphan}`,
        },
        docsUrl: 'https://en.wikipedia.org/wiki/Dead_code',
      })
    }
  }

  // 7. CI (Nice-to-have)
  const ciDiagFailing = [
    diagMap.get('missing-ci'),
    diagMap.get('no-ci-workflow'),
    diagMap.get('missing-ci-config'),
  ].filter((d) => d && normalizeStatus(d.status) !== 'pass')
  const ciRawFailing = rawMap.get('no-ci')?.count > 0

  if (ciDiagFailing.length > 0 || ciRawFailing) {
    coveredTopics.add('ci')
    merged.push({
      id: 'missing-ci',
      topic: 'ci',
      name: 'Missing Continuous Integration (CI)',
      fixTitle: 'Add a CI workflow in .github/workflows',
      severity: 'nice-to-have',
      dimension: 'hygiene',
      why: 'No CI workflow configured to automatically build and test code on pull requests.',
      fix: 'Create .github/workflows/ci.yml with automated build and test steps.',
      evidence: [{ file: '.github/workflows', line: 1, snippet: 'No workflow files found' }],
      count: 1,
      action: {
        type: 'file',
        value: '.github/workflows/ci.yml',
        label: 'Create .github/workflows/ci.yml',
      },
      docsUrl: 'https://docs.github.com/en/actions',
    })
  }

  // 8. LICENSE (Nice-to-have)
  const licenseDiagFailing = [diagMap.get('missing-license')].filter((d) => d && normalizeStatus(d.status) !== 'pass')
  const licenseRawFailing = rawMap.get('missing-license')?.count > 0

  if (licenseDiagFailing.length > 0 || licenseRawFailing) {
    coveredTopics.add('license')
    merged.push({
      id: 'missing-license',
      topic: 'license',
      name: 'Missing License',
      fixTitle: 'Add an open-source LICENSE file',
      severity: 'nice-to-have',
      dimension: 'hygiene',
      why: 'No LICENSE file found in repository root. Default copyright applies and others cannot contribute or use it.',
      fix: 'Create a LICENSE file (e.g. MIT, Apache-2.0) in the root directory.',
      evidence: [{ file: 'LICENSE', line: 1, snippet: 'Missing LICENSE file in repository root' }],
      count: 1,
      action: {
        type: 'file',
        value: 'LICENSE',
        label: 'Create LICENSE',
      },
      docsUrl: 'https://choosealicense.com',
    })
  }

  // 9. SECURITY POLICY (Nice-to-have)
  const secDiagFailing = [
    diagMap.get('missing-security-policy'),
    diagMap.get('security-policy'),
  ].filter((d) => d && normalizeStatus(d.status) !== 'pass')
  const secRawFailing = rawMap.get('missing-security-policy')?.count > 0

  if (secDiagFailing.length > 0 || secRawFailing) {
    coveredTopics.add('security-policy')
    merged.push({
      id: 'missing-security-policy',
      topic: 'security-policy',
      name: 'Missing Security Policy',
      fixTitle: 'Add a SECURITY.md vulnerability reporting policy',
      severity: 'nice-to-have',
      dimension: 'security',
      why: 'No SECURITY.md file found explaining how to report security vulnerabilities responsibly.',
      fix: 'Create a SECURITY.md file with contact information for confidential disclosure.',
      evidence: [{ file: 'SECURITY.md', line: 1, snippet: 'Missing SECURITY.md' }],
      count: 1,
      action: {
        type: 'file',
        value: 'SECURITY.md',
        label: 'Create SECURITY.md',
      },
      docsUrl: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
    })
  }

  // 10. DEPENDENCY UPDATES / LOCKFILE (Important)
  const lockDiagFailing = [
    diagMap.get('missing-lockfile'),
    diagMap.get('no-lockfile'),
  ].filter((d) => d && normalizeStatus(d.status) !== 'pass')
  const lockRawFailing = rawMap.get('missing-lockfile')?.count > 0

  if (lockDiagFailing.length > 0 || lockRawFailing) {
    coveredTopics.add('dependency-updates')
    merged.push({
      id: 'missing-lockfile',
      topic: 'dependency-updates',
      name: 'Missing Dependency Lockfile',
      fixTitle: 'Generate package-lock.json',
      severity: 'important',
      dimension: 'reliability',
      why: 'No lockfile found. Lockfiles ensure identical dependency versions across developer machines and CI.',
      fix: 'Run npm install to generate package-lock.json and commit it to git.',
      evidence: [{ file: 'package-lock.json', line: 1, snippet: 'Missing lockfile' }],
      count: 1,
      action: {
        type: 'command',
        value: 'npm install',
        label: 'npm install',
      },
      docsUrl: 'https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json',
    })
  }

  // 11. UNUSED DEPENDENCIES (Nice-to-have)
  const unused = deepScanData?.summary?.declaredButUnused || deepScanData?.declaredButUnused || []
  if (unused.length > 0) {
    coveredTopics.add('unused')
    for (const pkg of unused) {
      merged.push({
        id: `unused-${pkg}`,
        topic: 'unused',
        name: `Unused dependency "${pkg}"`,
        fixTitle: `Remove unused dependency "${pkg}"`,
        severity: 'nice-to-have',
        dimension: 'hygiene',
        why: `Declared in package.json dependencies but never imported in source files.`,
        fix: `npm uninstall ${pkg}`,
        evidence: [{ file: 'package.json', line: 1, snippet: `"${pkg}": "..."` }],
        count: 1,
        action: {
          type: 'command',
          value: `npm uninstall ${pkg}`,
          label: `npm uninstall ${pkg}`,
        },
        docsUrl: 'https://docs.npmjs.com/cli/v10/commands/npm-uninstall',
      })
    }
  }

  // 12. OTHER FAILING DIAGNOSTICS NOT IN COVERED TOPICS
  for (const d of diagnostics) {
    const s = normalizeStatus(d.status)
    if (s !== 'error' && s !== 'warning') continue
    const rKey = (d.rule || d.ruleId || '').toLowerCase()
    if (isCoveredTopic(rKey)) continue

    const fixContent = d.fix?.content
    const fixType = d.fix?.type === 'command' ? 'command' : (fixContent ? 'snippet' : null)
    let action
    if (d.file || d.filePath) {
      const file = d.file || d.filePath
      action = { type: 'file', value: file, label: `Inspect ${file}` }
    } else if (fixType === 'command') {
      action = { type: 'command', value: fixContent, label: fixContent }
    } else if (fixContent) {
      action = { type: 'command', value: fixContent, label: 'Copy fix snippet' }
    } else {
      action = {
        type: 'command',
        value: d.recommendation || d.fix?.description || d.message,
        label: d.recommendation || 'View check details',
      }
    }

    merged.push({
      id: `diag-${d.ruleId || d.rule}`,
      topic: d.ruleId || d.rule,
      name: d.title || d.rule || d.message,
      fixTitle: d.title || d.rule || d.message,
      severity: s === 'error' ? 'critical' : 'important',
      dimension: d.category ? d.category.toLowerCase() : 'reliability',
      why: d.why || 'Setup discrepancy degrades project health and reproducibility.',
      fix: fixContent || d.recommendation || 'Review check details.',
      evidence: d.file ? [{ file: d.file, line: 1, snippet: d.message }] : [],
      count: 1,
      action,
      docsUrl: d.docsUrl || null,
    })
  }

  // 13. OTHER RULE FINDINGS FROM RAW FINDINGS
  for (const f of rawFindings) {
    if (!f || !f.id || f.count <= 0) continue
    const fid = f.id.toLowerCase()
    if (
      fid === 'runtime-cycles' ||
      fid === 'undeclared-packages' ||
      fid === 'unresolved-imports' ||
      fid === 'no-test-script' ||
      fid === 'low-test-ratio' ||
      fid === 'missing-tests' ||
      fid === 'missing-engines-field' ||
      fid === 'node-version-mismatch' ||
      fid === 'orphans' ||
      fid === 'no-ci' ||
      fid === 'missing-license' ||
      fid === 'missing-security-policy' ||
      fid === 'missing-lockfile' ||
      fid === 'unused-dependencies'
    ) {
      continue
    }

    merged.push({
      id: f.id,
      topic: f.id,
      name: f.name || f.id,
      fixTitle: f.name || f.id,
      severity: f.severity || 'important',
      dimension: f.dimension || 'reliability',
      why: f.why || 'Identified potential issue during whole-project analysis.',
      fix: f.fix || 'Review finding details.',
      evidence: Array.isArray(f.evidence) ? f.evidence : [],
      count: f.count || 1,
      action: (f.evidence && f.evidence.length > 0 && f.evidence[0].file)
        ? { type: 'file', value: f.evidence[0].file, label: `Inspect ${f.evidence[0].file}` }
        : (f.fix ? { type: 'command', value: f.fix, label: f.fix } : null),
      docsUrl: f.docsUrl || null,
    })
  }

  // Sort by severity (critical first, then important, then nice-to-have)
  const rank = { critical: 0, important: 1, 'nice-to-have': 2, 'nice to have': 2 }
  const getRank = (s) => rank[String(s || '').toLowerCase().replace(/\s+/g, '-')] ?? 3
  merged.sort((a, b) => getRank(a.severity) - getRank(b.severity))

  return merged
}
