import { normalizeStatus } from './diagnosisFormatters.js'

/**
 * Format project tech stack in clear, natural words.
 * Example: "A React app built with Vite, written in JavaScript"
 */
export function formatStackInPlainWords({
  framework = null,
  stack = [],
  language = null,
  monorepo = false,
} = {}) {
  const stackNames = (Array.isArray(stack) ? stack : [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean)

  const hasVite = stackNames.some((s) => /^vite$/i.test(s))
  const hasWebpack = stackNames.some((s) => /^webpack$/i.test(s))
  const hasNext = stackNames.some((s) => /^next(\.js)?$/i.test(s)) || /^next(\.js)?$/i.test(framework)
  const hasNuxt = stackNames.some((s) => /^nuxt(\.js)?$/i.test(s)) || /^nuxt(\.js)?$/i.test(framework)
  const isTypeScript = /^typescript$/i.test(language) || stackNames.some((s) => /^typescript$/i.test(s))
  const langName = isTypeScript ? 'TypeScript' : (language || 'JavaScript')

  let baseType = 'project'
  if (monorepo) {
    baseType = 'monorepo'
  } else if (hasNext || hasNuxt || framework) {
    baseType = 'app'
  }

  let frameworkPart = ''
  if (hasNext) {
    frameworkPart = 'Next.js'
  } else if (hasNuxt) {
    frameworkPart = 'Nuxt'
  } else if (framework) {
    frameworkPart = framework
  }

  let bundlerPart = ''
  if (hasVite && !hasNext && !hasNuxt) {
    bundlerPart = 'built with Vite'
  } else if (hasWebpack && !hasNext && !hasNuxt) {
    bundlerPart = 'built with Webpack'
  }

  // Construct readable sentence
  let description
  if (monorepo) {
    const tools = [frameworkPart, hasVite ? 'Vite' : ''].filter(Boolean).join(' and ')
    description = tools
      ? `A ${langName} monorepo using ${tools}`
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

  return description
}

/**
 * Derive health verdict (icon, text, tone/color, one-sentence why) from existing score and production findings only.
 */
export function getHealthVerdict({
  health = null,
  diagnostics = [],
  deepScanData = null,
} = {}) {
  // Production findings only
  const prodErrors = diagnostics.filter((d) => normalizeStatus(d.status) === 'error').length
  const prodWarnings = diagnostics.filter((d) => normalizeStatus(d.status) === 'warning').length

  const cycles = deepScanData?.summary?.cycles || []
  const runtimeCycles = cycles.filter((c) => !c?.isTypeOnly).length

  const undeclaredCount = deepScanData?.summary?.usedButUndeclared?.length || 0
  const unusedCount = deepScanData?.summary?.declaredButUnused?.length || 0
  const orphansCount = deepScanData?.summary?.orphans?.length || 0

  const totalCritical = prodErrors + runtimeCycles + undeclaredCount
  const totalIssues = totalCritical + prodWarnings + orphansCount + unusedCount

  const score = typeof health?.score === 'number'
    ? health.score
    : Math.max(0, 100 - totalCritical * 20 - prodWarnings * 8)

  let verdict = 'Looking healthy'
  let icon = '✓'
  let tone = 'healthy' // green

  if (score < 70 || totalCritical > 0 || (prodErrors + prodWarnings + runtimeCycles + undeclaredCount) > 3) {
    verdict = 'Needs attention'
    icon = '✖'
    tone = 'attention' // red
  } else if (score < 90 || totalIssues > 0 || prodWarnings > 1) {
    verdict = 'A few things to fix'
    icon = '⚠'
    tone = 'warning' // amber
  }

  // One sentence why
  let whySentence = 'All setup checks passed with no circular dependencies or missing packages.'
  if (runtimeCycles > 0) {
    whySentence = `${runtimeCycles} circular ${runtimeCycles === 1 ? 'dependency was' : 'dependencies were'} found.`
  } else if (undeclaredCount > 0) {
    whySentence = `${undeclaredCount} undeclared external ${undeclaredCount === 1 ? 'package was' : 'packages were'} found.`
  } else if (prodErrors > 0) {
    whySentence = `${prodErrors} critical setup ${prodErrors === 1 ? 'issue was' : 'issues were'} found.`
  } else if (prodWarnings > 0) {
    whySentence = `${prodWarnings} setup ${prodWarnings === 1 ? 'warning was' : 'warnings were'} found.`
  } else if (orphansCount > 0) {
    whySentence = `${orphansCount} orphan ${orphansCount === 1 ? 'file was' : 'files were'} detected.`
  } else if (unusedCount > 0) {
    whySentence = `${unusedCount} unused ${unusedCount === 1 ? 'dependency was' : 'dependencies were'} found.`
  }

  return {
    label: verdict,
    icon,
    tone,
    score,
    whySentence,
    counts: {
      critical: totalCritical,
      warnings: prodWarnings,
      runtimeCycles,
      undeclared: undeclaredCount,
      unused: unusedCount,
      orphans: orphansCount,
      totalIssues,
    },
  }
}

/**
 * Build ordered next steps from diagnostics, fix suggestions, runtime cycles, undeclared deps, unused deps, and orphans.
 * Max 3 shown by default, ordered by severity.
 */
export function getWhatToDoNext({
  diagnostics = [],
  deepScanData = null,
} = {}) {
  const steps = []

  // 1. Runtime cycles (Critical)
  const cycles = deepScanData?.summary?.cycles || []
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
  const undeclared = deepScanData?.summary?.usedButUndeclared || []
  for (const pkg of undeclared) {
    steps.push({
      id: `undeclared-${pkg}`,
      severity: 'Critical',
      severityOrder: 0,
      title: `Install undeclared package "${pkg}"`,
      why: 'Missing packages will cause build and execution failures in clean installs and CI pipelines.',
      action: {
        type: 'command',
        value: `npm install ${pkg}`,
        label: `npm install ${pkg}`,
      },
    })
  }

  // 3. Diagnostics errors & warnings (Critical for errors, Important for warnings)
  for (let idx = 0; idx < diagnostics.length; idx++) {
    const d = diagnostics[idx]
    const status = normalizeStatus(d.status)
    if (status !== 'error' && status !== 'warning') continue

    const isError = status === 'error'
    const fixContent = d.fix?.content
    const fixType = d.fix?.type === 'command' ? 'command' : (fixContent ? 'snippet' : null)

    let action
    if (fixType === 'command') {
      action = {
        type: 'command',
        value: fixContent,
        label: fixContent,
      }
    } else if (d.file || d.filePath) {
      const file = d.file || d.filePath
      action = {
        type: 'file',
        value: file,
        label: `Open ${file}`,
      }
    } else if (fixContent) {
      action = {
        type: 'command',
        value: fixContent,
        label: `Copy fix snippet`,
      }
    } else {
      action = {
        type: 'command',
        value: d.recommendation || d.fix?.description || d.message,
        label: d.recommendation || 'View check details',
      }
    }

    steps.push({
      id: `diag-${d.ruleId || d.rule || idx}`,
      severity: isError ? 'Critical' : 'Important',
      severityOrder: isError ? 0 : 1,
      title: d.title || d.rule || d.message,
      why: d.why || (isError ? 'Critical setup issues degrade project health and reliability.' : 'Resolving setup warnings avoids unexpected tooling drift.'),
      action,
    })
  }

  // 4. Orphan files (Important)
  const orphans = deepScanData?.summary?.orphans || []
  for (const orphan of orphans) {
    steps.push({
      id: `orphan-${orphan}`,
      severity: 'Important',
      severityOrder: 1,
      title: `Review orphan file "${orphan}"`,
      why: 'Orphan files are never imported in your project and may be dead code that increases maintenance load.',
      action: {
        type: 'file',
        value: orphan,
        label: `Inspect ${orphan}`,
      },
    })
  }

  // 5. Declared but unused dependencies (Nice to have)
  const unused = deepScanData?.summary?.declaredButUnused || []
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
