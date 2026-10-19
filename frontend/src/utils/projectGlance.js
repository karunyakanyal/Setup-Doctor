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

  const cleanFramework = capitalizeKnownName(framework)
  const fwLower = cleanFramework.toLowerCase()

  const hasVite = stackNames.some((s) => /^vite$/i.test(s)) || fwLower === 'vite'
  const hasWebpack = stackNames.some((s) => /^webpack$/i.test(s)) || fwLower === 'webpack'
  const hasNext = stackNames.some((s) => /^next(\.js)?$/i.test(s)) || /^next(\.js)?$/i.test(cleanFramework)
  const hasNuxt = stackNames.some((s) => /^nuxt(\.js)?$/i.test(s)) || /^nuxt(\.js)?$/i.test(cleanFramework)
  const isTypeScript = /^typescript$/i.test(language) || stackNames.some((s) => /^typescript$/i.test(s))
  const isNode = /^node(\.js)?$/i.test(language) || stackNames.some((s) => /^node(\.js)?$/i.test(s))

  let langName = 'JavaScript'
  if (isTypeScript) {
    langName = 'TypeScript'
  } else if (isNode) {
    langName = 'Node.js'
  } else if (language) {
    langName = capitalizeKnownName(language)
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
export function getHealthVerdict({
  health = null,
  diagnostics = [],
  deepScanData = null,
  deepScanStatus = 'idle',
  includeNonProd = false,
} = {}) {
  const prodErrors = diagnostics.filter((d) => normalizeStatus(d.status) === 'error').length
  const prodWarnings = diagnostics.filter((d) => normalizeStatus(d.status) === 'warning').length
  const nonPassingDiag = diagnostics.filter((d) => {
    const s = normalizeStatus(d.status)
    return s !== 'pass' && s !== 'info'
  }).length

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
    let verdict = 'Looking healthy'
    let icon = '✓'
    let tone = 'healthy'

    if (prodErrors > 0) {
      verdict = 'Needs attention'
      icon = '✖'
      tone = 'attention'
    } else if (prodWarnings > 0) {
      verdict = 'A few things to fix'
      icon = '⚠'
      tone = 'warning'
    }

    const whySentence = 'Code Map unavailable, so this verdict covers setup checks only.'
    const fallbackScore = typeof health?.score === 'number'
      ? health.score
      : (prodErrors > 0 ? 60 : (prodWarnings > 0 ? 80 : 100))

    return {
      label: verdict,
      icon,
      tone,
      score: fallbackScore,
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

  // Verdict rules (production only):
  // - Needs attention: any failed critical diagnostic, or >= 1 undeclared package.
  // - A few things to fix: any runtime cycle, orphan, unresolved import or unused dependency, or any non-passing diagnostic.
  // - Looking healthy: none of the above.
  let verdict = 'Looking healthy'
  let icon = '✓'
  let tone = 'healthy'

  const hasCritical = prodErrors > 0 || undeclaredCount >= 1
  const hasFixable =
    runtimeCyclesCount > 0 ||
    orphansCount > 0 ||
    unresolvedCount > 0 ||
    unusedCount > 0 ||
    nonPassingDiag > 0

  if (hasCritical) {
    verdict = 'Needs attention'
    icon = '✖'
    tone = 'attention'
  } else if (hasFixable) {
    verdict = 'A few things to fix'
    icon = '⚠'
    tone = 'warning'
  }

  const rawScore = typeof health?.score === 'number' ? health.score : 100

  // Glance card: do not show the numeric score next to the verdict unless it
  // is computed from the same findings that drive the verdict. Otherwise hide
  // it and show the verdict only.
  const hasGraphFindings =
    runtimeCyclesCount > 0 ||
    orphansCount > 0 ||
    unresolvedCount > 0 ||
    undeclaredCount > 0 ||
    unusedCount > 0

  const isScoreUnified = !hasGraphFindings
  const scoreToDisplay = isScoreUnified ? rawScore : null
  const showScore = isScoreUnified

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

  return {
    label: verdict,
    icon,
    tone,
    score: scoreToDisplay,
    showScore,
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
  const steps = []

  // 1. Runtime cycles (Critical)
  let cycles = deepScanData?.summary?.cycles || deepScanData?.cycles || []
  if (includeNonProd) {
    if (deepScanData?.summary?.allCycles) {
      cycles = deepScanData.summary.allCycles
    } else if (deepScanData?.summary?.nonProdCycles) {
      cycles = [...cycles, ...deepScanData.summary.nonProdCycles]
    }
  }

  for (let idx = 0; idx < cycles.length; idx++) {
    const cycle = cycles[idx]
    if (cycle?.isTypeOnly) continue

    const files = Array.isArray(cycle) ? cycle : (cycle?.files || [])
    const shortest = (Array.isArray(cycle?.shortest) && cycle.shortest.length > 0)
      ? cycle.shortest
      : files
    const loopStr = (shortest.length > 1 && shortest[0] !== shortest[shortest.length - 1])
      ? [...shortest, shortest[0]].join(' → ')
      : shortest.join(' → ')

    const targetFile = shortest[0] || files[0] || 'cycle'

    steps.push({
      id: `cycle-${idx}-${targetFile}`,
      severity: 'Critical',
      severityOrder: 0,
      title: `Break circular dependency: ${loopStr}`,
      why: 'Circular imports cause tight coupling and can evaluate modules before their exports are initialized.',
      action: {
        type: 'file',
        value: targetFile,
        label: `Inspect ${targetFile}`,
      },
    })
  }

  // 2. Used but undeclared dependencies (Critical)
  const undeclared = deepScanData?.summary?.usedButUndeclared || deepScanData?.usedButUndeclared || []
  for (const pkg of undeclared) {
    steps.push({
      id: `undeclared-${pkg}`,
      severity: 'Critical',
      severityOrder: 0.1,
      title: `Install undeclared package "${pkg}"`,
      why: 'Missing packages will cause build and execution failures in clean installs and CI pipelines.',
      action: {
        type: 'command',
        value: `npm install ${pkg}`,
        label: `npm install ${pkg}`,
      },
    })
  }

  // 3. Critical diagnostics errors (Critical)
  for (let idx = 0; idx < diagnostics.length; idx++) {
    const d = diagnostics[idx]
    const status = normalizeStatus(d.status)
    if (status !== 'error') continue

    const fixContent = d.fix?.content
    const fixType = d.fix?.type === 'command' ? 'command' : (fixContent ? 'snippet' : null)

    let action
    if (fixType === 'command') {
      action = { type: 'command', value: fixContent, label: fixContent }
    } else if (d.file || d.filePath) {
      const file = d.file || d.filePath
      action = { type: 'file', value: file, label: `Open ${file}` }
    } else if (fixContent) {
      action = { type: 'command', value: fixContent, label: `Copy fix snippet` }
    } else {
      action = {
        type: 'command',
        value: d.recommendation || d.fix?.description || d.message,
        label: d.recommendation || 'View check details',
      }
    }

    steps.push({
      id: `diag-error-${d.ruleId || d.rule || idx}`,
      severity: 'Critical',
      severityOrder: 0.2,
      title: d.title || d.rule || d.message,
      why: d.why || 'Critical setup issues degrade project health and reliability.',
      action,
    })
  }

  // 4. Unresolved imports (Important)
  const rawUnresolved = deepScanData?.unresolvedImports || deepScanData?.summary?.unresolvedImports || []
  let unresolvedList
  if (includeNonProd) {
    unresolvedList = rawUnresolved
  } else {
    unresolvedList = rawUnresolved.filter((item) => item.category !== 'non-production')
  }

  if (unresolvedList.length === 0 && deepScanData?.summary?.unresolvedItems) {
    const missingRel = deepScanData.summary.unresolvedItems.missingRelative || []
    const missingAli = deepScanData.summary.unresolvedItems.unresolvedAlias || []
    const combined = [...missingRel, ...missingAli]
    unresolvedList = includeNonProd ? combined : combined.filter((item) => item.category !== 'non-production')
  }

  for (let idx = 0; idx < unresolvedList.length; idx++) {
    const item = unresolvedList[idx]
    const spec = item.specifier || item.target || 'module'
    const from = item.from || item.file || 'source'

    steps.push({
      id: `unresolved-${idx}-${from}-${spec}`,
      severity: 'Important',
      severityOrder: 1,
      title: `Resolve missing import "${spec}" in ${from}`,
      why: 'This import could not be resolved to any file or package, which may cause runtime or build errors.',
      action: {
        type: 'file',
        value: from,
        label: `Inspect ${from}`,
      },
    })
  }

  // 5. Diagnostics warnings (Important)
  for (let idx = 0; idx < diagnostics.length; idx++) {
    const d = diagnostics[idx]
    const status = normalizeStatus(d.status)
    if (status !== 'warning') continue

    const fixContent = d.fix?.content
    const fixType = d.fix?.type === 'command' ? 'command' : (fixContent ? 'snippet' : null)

    let action
    if (fixType === 'command') {
      action = { type: 'command', value: fixContent, label: fixContent }
    } else if (d.file || d.filePath) {
      const file = d.file || d.filePath
      action = { type: 'file', value: file, label: `Open ${file}` }
    } else if (fixContent) {
      action = { type: 'command', value: fixContent, label: `Copy fix snippet` }
    } else {
      action = {
        type: 'command',
        value: d.recommendation || d.fix?.description || d.message,
        label: d.recommendation || 'View check details',
      }
    }

    steps.push({
      id: `diag-warn-${d.ruleId || d.rule || idx}`,
      severity: 'Important',
      severityOrder: 1.2,
      title: d.title || d.rule || d.message,
      why: d.why || 'Resolving setup warnings avoids unexpected tooling drift.',
      action,
    })
  }

  // 6. Orphan files (Important)
  const orphans = deepScanData?.summary?.orphans || deepScanData?.orphans || []
  for (const orphan of orphans) {
    steps.push({
      id: `orphan-${orphan}`,
      severity: 'Important',
      severityOrder: 1.5,
      title: `Review orphan file "${orphan}"`,
      why: 'Orphan files are never imported in your project and may be dead code that increases maintenance load.',
      action: {
        type: 'file',
        value: orphan,
        label: `Inspect ${orphan}`,
      },
    })
  }

  // 7. Declared but unused dependencies (Nice to have)
  const unused = deepScanData?.summary?.declaredButUnused || deepScanData?.declaredButUnused || []
  for (const pkg of unused) {
    steps.push({
      id: `unused-${pkg}`,
      severity: 'Nice to have',
      severityOrder: 2,
      title: `Remove unused dependency "${pkg}"`,
      why: 'Unused dependencies bloat install times and needlessly increase security scan surfaces.',
      action: {
        type: 'command',
        value: `npm uninstall ${pkg}`,
        label: `npm uninstall ${pkg}`,
      },
    })
  }

  // Sort by severity (Critical -> Important -> Nice to have)
  steps.sort((a, b) => a.severityOrder - b.severityOrder)

  if (steps.length === 0) {
    if (deepScanStatus === 'scanning') {
      return [
        {
          id: 'scanning-step',
          isZeroState: true,
          severity: 'Scanning',
          severityOrder: 0,
          title: 'Scanning repository code...',
          why: 'Analyzing file dependencies, cycles, and imports in the background.',
          action: null,
        },
      ]
    }

    return [
      {
        id: 'clean-maintenance',
        isZeroState: true,
        severity: 'Maintenance',
        severityOrder: 3,
        title: 'Nothing to fix right now',
        why: 'All setup checks, dependencies, and imports are currently in good order.',
        action: {
          type: 'command',
          value: 'npm outdated',
          label: 'Run npm outdated (maintenance)',
        },
      },
    ]
  }

  return steps
}
