import { useState, useMemo, useRef } from 'react'
import { getImpact, getFileConnections, getCycleOverstatedImpact } from '../../utils/graphImpact.js'
import { isConfigFile } from '../../utils/configFiles.js'
import { classifyFileType, groupLanguages } from '../../utils/languages.js'
import NeighborhoodGraph from './NeighborhoodGraph.jsx'

const REASON_METADATA = {
  'relative-not-found': {
    title: 'Relative not found',
    explanation: 'relative path does not exist on disk',
  },
  'directory-index-not-found': {
    title: 'Directory index not found',
    explanation: 'directory exists or was specified, but directory index file (index.js/ts) was not found',
  },
  'alias-unresolved': {
    title: 'Alias unresolved',
    explanation: 'alias could not be read from tsconfig, vite or webpack config',
  },
  'package-imports-unresolved': {
    title: 'Package imports unresolved',
    explanation: 'subpath import (#) could not be resolved from package.json imports',
  },
  'other': {
    title: 'Other unresolved imports',
    explanation: 'unresolved import or unrecognized module specifier',
  },
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PaginatedList({
  items = [],
  limit = 30,
  renderItem,
  listClassName = '',
  listTag: ListTag = 'ul',
  label = 'items',
}) {
  const [expanded, setExpanded] = useState(false)
  if (!items || items.length === 0) return null

  const displayed = expanded ? items : items.slice(0, limit)
  const hasMore = items.length > limit

  return (
    <div className="codemap-paginated-wrap">
      <ListTag className={listClassName}>
        {displayed.map((item, idx) => renderItem(item, idx))}
      </ListTag>
      {hasMore && (
        <div className="codemap-show-more-wrap">
          <button
            type="button"
            className="codemap-show-more-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? `Show fewer ${label}` : `Show all ${items.length} ${label}`}
          >
            {expanded ? 'Show fewer' : `Show all ${items.length}`}
          </button>
        </div>
      )}
    </div>
  )
}

function PaginatedTableRows({
  items = [],
  limit = 30,
  renderRow,
  label = 'rows',
  colSpan = 3,
}) {
  const [expanded, setExpanded] = useState(false)
  if (!items || items.length === 0) return null

  const displayed = expanded ? items : items.slice(0, limit)
  const hasMore = items.length > limit

  return (
    <>
      {displayed.map((item, idx) => renderRow(item, idx))}
      {hasMore && (
        <tr className="codemap-show-more-row">
          <td colSpan={colSpan}>
            <div className="codemap-show-more-wrap">
              <button
                type="button"
                className="codemap-show-more-btn"
                onClick={() => setExpanded((prev) => !prev)}
                aria-label={expanded ? `Show fewer ${label}` : `Show all ${items.length} ${label}`}
              >
                {expanded ? 'Show fewer' : `Show all ${items.length}`}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CodeMapPanel({
  data,
  status = 'idle',
  error = null,
  onRerun,
  initialShowUnresolvedPanel = false,
  initialIncludeNonProd = false,
  initialExpandedReasons = {},
}) {
  const isScanning = status === 'scanning'
  const isError = status === 'error' && Boolean(error)
  const hasData = Boolean(data && data.graph && data.inventory)

  const [selectedFile, setSelectedFile] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUnresolvedPanel, setShowUnresolvedPanel] = useState(initialShowUnresolvedPanel)
  const [includeNonProd, setIncludeNonProd] = useState(initialIncludeNonProd)
  const [expandedReasons, setExpandedReasons] = useState(initialExpandedReasons)
  const unresolvedPanelRef = useRef(null)

  const toggleUnresolvedPanel = () => {
    setShowUnresolvedPanel((prev) => {
      const next = !prev
      if (next) {
        setTimeout(() => {
          unresolvedPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 50)
      }
      return next
    })
  }

  const toggleExpandReason = (reasonKey) => {
    setExpandedReasons((prev) => ({
      ...prev,
      [reasonKey]: !prev[reasonKey],
    }))
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.focus?.()
    }
  }

  const handleInspectFile = (filePath) => {
    setSelectedFile(filePath)
    const el = document.getElementById('heading-file-explorer')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  // Computed metrics from data
  const coverage = data?.coverage || {}
  const inventory = data?.inventory || {}
  const summary = useMemo(() => data?.summary || {}, [data?.summary])
  const graph = useMemo(() => data?.graph || { nodes: [], edges: [], externals: [] }, [data?.graph])

  const hasNonProdFiles = useMemo(() => {
    if (graph.nodes?.some((n) => n.category === 'non-production' || Boolean(n.isTest))) {
      return true
    }
    if (summary.nonProduction) {
      const np = summary.nonProduction
      if (
        (np.packages || 0) > 0 ||
        (np.cycles || 0) > 0 ||
        (np.orphans || 0) > 0 ||
        (np.unresolved || 0) > 0 ||
        (np.declaredDependencies || 0) > 0 ||
        (np.declaredButUnused || 0) > 0 ||
        (np.usedButUndeclared || 0) > 0
      ) {
        return true
      }
    }
    if (summary.packages?.some((p) => Boolean(p.isNonProduction))) {
      return true
    }
    return false
  }, [graph.nodes, summary.nonProduction, summary.packages])

  const skippedCount = useMemo(() => {
    const skippedObj = coverage.skipped || inventory.skipped || {}
    return Object.values(skippedObj).reduce((sum, count) => sum + (Number(count) || 0), 0)
  }, [coverage.skipped, inventory.skipped])

  const graphFilesCount = coverage.graphFiles ?? data?.graphFiles ?? graph.nodes?.length ?? 0
  const totalFiles = coverage.totalFiles ?? inventory.totalFiles ?? (graphFilesCount + skippedCount)
  const analyzedFiles = coverage.analyzedFiles ?? inventory.analyzedFiles ?? Math.max(0, totalFiles - skippedCount)

  const otherFilesCount = Math.max(0, analyzedFiles - graphFilesCount)

  // Language inventory parsing using shared allowlist in languages.js:
  // - Languages: PROGRAMMING allowlist with count > 0
  // - Data and docs: DATA_AND_DOCS allowlist with count > 0
  // - Other file types: anything else (never title-cased)
  const {
    languages: realLanguages,
    dataAndDocs,
    otherFileTypes,
    programmingCount,
  } = useMemo(() => {
    return groupLanguages(inventory.byLanguage || {})
  }, [inventory.byLanguage])

  // Languages card counts only PROGRAMMING entries with count > 0
  const languageCount = useMemo(() => {
    if (inventory.byLanguage && Object.keys(inventory.byLanguage).length > 0) {
      return programmingCount
    }
    const combined = {}
    if (coverage.graphLanguages) {
      for (const [k, v] of Object.entries(coverage.graphLanguages)) {
        combined[k] = (combined[k] || 0) + (Number(v) || 0)
      }
    }
    if (coverage.inventoryOnlyLanguages) {
      for (const [k, v] of Object.entries(coverage.inventoryOnlyLanguages)) {
        combined[k] = (combined[k] || 0) + (Number(v) || 0)
      }
    }
    return groupLanguages(combined).programmingCount
  }, [programmingCount, inventory.byLanguage, coverage.graphLanguages, coverage.inventoryOnlyLanguages])

  const entryPoints = summary.entryPoints || []
  const cycles = useMemo(() => summary.cycles || [], [summary.cycles])
  const typeOnlyCycles = useMemo(() => summary.typeOnlyCycles || [], [summary.typeOnlyCycles])
  const configFiles = useMemo(() => summary.configFiles || [], [summary.configFiles])
  const orphans = useMemo(
    () => (summary.orphans || []).filter((p) => !configFiles.includes(p)),
    [summary.orphans, configFiles],
  )

  // Non-production counters from summary.nonProduction
  const nonProdCycles = summary.nonProduction?.cycles ?? 0
  const nonProdOrphans = summary.nonProduction?.orphans ?? 0

  const rawUnresolvedImports = useMemo(() => {
    return data?.unresolvedImports || summary?.unresolvedImports || data?.graph?.unresolvedImports || []
  }, [data, summary])

  const nonProdUnresolved = summary.nonProduction?.unresolved ?? rawUnresolvedImports.filter((i) => i.category === 'non-production').length
  const prodUnresolved = rawUnresolvedImports.length > 0
    ? rawUnresolvedImports.filter((i) => i.category !== 'non-production').length
    : Math.max(0, (summary.unresolvedCount ?? data?.unresolvedCount ?? 0) - nonProdUnresolved)

  const displayedCyclesCount = includeNonProd ? (cycles.length + nonProdCycles) : cycles.length
  const cyclesSuffix = (!includeNonProd && nonProdCycles > 0) ? `(+${nonProdCycles.toLocaleString()} in tests/fixtures)` : ''

  const displayedOrphansCount = includeNonProd ? (orphans.length + nonProdOrphans) : orphans.length
  const orphansSuffix = (!includeNonProd && nonProdOrphans > 0) ? `(+${nonProdOrphans.toLocaleString()} in tests/fixtures)` : ''

  const displayedUnresolvedCount = includeNonProd ? (prodUnresolved + nonProdUnresolved) : prodUnresolved
  const unresolvedSuffix = (!includeNonProd && nonProdUnresolved > 0) ? `(+${nonProdUnresolved.toLocaleString()} in tests/fixtures)` : ''

  const displayedCycles = useMemo(() => {
    if (includeNonProd) {
      if (summary.allCycles) return summary.allCycles
      if (summary.nonProdCycles) return [...cycles, ...summary.nonProdCycles]
      return cycles
    }
    return cycles
  }, [includeNonProd, cycles, summary.allCycles, summary.nonProdCycles])

  const displayedOrphansList = useMemo(() => {
    if (includeNonProd) {
      if (summary.allOrphans) return summary.allOrphans
      if (summary.nonProdOrphans) return [...orphans, ...summary.nonProdOrphans]
      if (summary.nonProduction?.orphanFiles) return [...orphans, ...summary.nonProduction.orphanFiles]
      return orphans
    }
    return orphans
  }, [includeNonProd, orphans, summary.allOrphans, summary.nonProdOrphans, summary.nonProduction])

  const unresolvedTruncated = Boolean(
    data?.unresolvedTruncated ||
    summary?.unresolvedTruncated ||
    rawUnresolvedImports?.truncated
  )

  const displayedUnresolved = useMemo(() => {
    if (includeNonProd) {
      return rawUnresolvedImports
    }
    return rawUnresolvedImports.filter((item) => item.category !== 'non-production')
  }, [rawUnresolvedImports, includeNonProd])

  const groupedByReason = useMemo(() => {
    const groups = {
      'relative-not-found': [],
      'directory-index-not-found': [],
      'alias-unresolved': [],
      'package-imports-unresolved': [],
      'other': [],
    }
    for (const item of displayedUnresolved) {
      const r = groups[item.reason] ? item.reason : 'other'
      groups[r].push(item)
    }
    return groups
  }, [displayedUnresolved])

  const displayedHotspots = useMemo(() => {
    const raw = summary.hotspots || { byFanIn: [], byTransitiveImpact: [] }
    const filterFn = (item) => {
      if (configFiles.includes(item.path)) return false
      if (!includeNonProd) {
        const node = graph.nodes?.find((n) => n.path === item.path)
        if (node?.category === 'non-production') return false
      }
      return true
    }
    return {
      byFanIn: (raw.byFanIn || []).filter(filterFn),
      byTransitiveImpact: (raw.byTransitiveImpact || []).filter(filterFn),
    }
  }, [summary.hotspots, configFiles, includeNonProd, graph.nodes])

  // Unsupported list for approximate analysis box
  const unsupportedList = useMemo(() => {
    const list = []
    const raw = coverage.inventoryOnlyLanguages || {}
    const inventoryLangs = (Object.keys(raw).length > 0)
      ? raw
      : (inventory.byLanguage || {})

    const graphLangKeys = new Set(
      Object.keys(coverage.graphLanguages || {}).map((k) => k.toLowerCase())
    )
    if (graphLangKeys.size === 0 && graph.nodes?.length) {
      for (const node of graph.nodes) {
        if (node.lang) graphLangKeys.add(node.lang.toLowerCase())
      }
    }

    let otherCount = 0
    for (const [lang, rawCount] of Object.entries(inventoryLangs)) {
      const count = Number(rawCount) || 0
      const l = lang.toLowerCase()
      if (l === 'binary') continue
      if (l === 'other' || l === 'gitignore' || l === 'txt' || l === 'config/other' || ((lang.includes('/') || lang.includes('\\')) && l !== 'config/other')) {
        otherCount += count
        continue
      }
      if (!graphLangKeys.has(l)) {
        const classified = classifyFileType(lang)
        list.push({
          lang,
          name: classified.label,
          count,
        })
      }
    }

    const sumLangs = list.reduce((sum, item) => sum + item.count, 0)
    const effectiveOther = Math.max(otherCount, otherFilesCount - sumLangs)
    if (effectiveOther > 0) {
      list.push({
        lang: 'other',
        name: 'Other',
        count: effectiveOther,
      })
    }

    return list
  }, [coverage.inventoryOnlyLanguages, coverage.graphLanguages, inventory.byLanguage, graph.nodes, otherFilesCount])

  const unsupportedSummaryText = useMemo(() => {
    if (!unsupportedList.length) return ''
    return unsupportedList
      .map((item) => `${item.name}: ${item.count} ${item.count === 1 ? 'file' : 'files'}, not mapped`)
      .join(', ')
  }, [unsupportedList])

  // Filtered files for File Explorer
  const filteredNodes = useMemo(() => {
    let list = graph.nodes || []
    if (!includeNonProd) {
      list = list.filter((n) => n.category !== 'non-production')
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((node) => node.path.toLowerCase().includes(q))
  }, [graph.nodes, includeNonProd, searchQuery])

  // Default selected file for file explorer
  const defaultFile = useMemo(() => {
    if (!graph.nodes?.length) return ''
    const candidateNodes = includeNonProd ? graph.nodes : graph.nodes.filter((n) => n.category !== 'non-production')
    if (!candidateNodes.length) return graph.nodes[0]?.path || ''
    const topImpact = summary.hotspots?.byTransitiveImpact?.find((h) => candidateNodes.some((n) => n.path === h.path))?.path
    const topFanIn = summary.hotspots?.byFanIn?.find((h) => candidateNodes.some((n) => n.path === h.path))?.path
    return topImpact || topFanIn || candidateNodes[0].path || ''
  }, [graph.nodes, includeNonProd, summary.hotspots])

  // Selected file details
  const activeFile = (selectedFile && graph.nodes?.some((node) => node.path === selectedFile))
    ? selectedFile
    : defaultFile || (filteredNodes[0] ? filteredNodes[0].path : '')

  const activeNode = useMemo(() => {
    return graph.nodes?.find((node) => node.path === activeFile) || null
  }, [graph.nodes, activeFile])

  const fileConnections = useMemo(() => {
    return getFileConnections(graph, activeFile)
  }, [graph, activeFile])

  const fileImpact = useMemo(() => {
    return getImpact(graph, activeFile)
  }, [graph, activeFile])

  const cycleImpact = useMemo(() => {
    return getCycleOverstatedImpact(graph, cycles, activeFile)
  }, [graph, cycles, activeFile])

  // Neighborhood graph visible nodes filtered by includeNonProd so it never disagrees with the toggle
  const activeImporters = useMemo(() => {
    if (includeNonProd) return fileConnections.importers
    return fileConnections.importers.filter((p) => {
      const n = graph.nodes?.find((node) => node.path === p)
      return n?.category !== 'non-production'
    })
  }, [fileConnections.importers, includeNonProd, graph.nodes])

  const activeImports = useMemo(() => {
    if (includeNonProd) return fileConnections.imports
    return fileConnections.imports.filter((p) => {
      const n = graph.nodes?.find((node) => node.path === p)
      return n?.category !== 'non-production'
    })
  }, [fileConnections.imports, includeNonProd, graph.nodes])

  // Active packages based on non-production toggle
  const activePackages = useMemo(() => {
    if (!Array.isArray(summary.packages) || summary.packages.length === 0) return []
    if (includeNonProd) return summary.packages
    return summary.packages.filter((pkg) => !pkg.isNonProduction)
  }, [summary.packages, includeNonProd])

  // Partition packages into those with issues and those with 0 issues
  const { packagesWithIssues, zeroIssuePackages } = useMemo(() => {
    const withIssues = []
    const zeroIssues = []
    for (const pkg of activePackages) {
      const unused = pkg.declaredButUnused?.length || 0
      const undeclared = pkg.usedButUndeclared?.length || 0
      if (unused + undeclared > 0) {
        withIssues.push(pkg)
      } else {
        zeroIssues.push(pkg)
      }
    }
    // Sort packages by issue count, highest first
    withIssues.sort((a, b) => {
      const aCount = (a.declaredButUnused?.length || 0) + (a.usedButUndeclared?.length || 0)
      const bCount = (b.declaredButUnused?.length || 0) + (b.usedButUndeclared?.length || 0)
      return bCount - aCount
    })
    return { packagesWithIssues: withIssues, zeroIssuePackages: zeroIssues }
  }, [activePackages])

  const [showAllPackages, setShowAllPackages] = useState(false)
  const displayedIssuesPackages = showAllPackages
    ? packagesWithIssues
    : packagesWithIssues.slice(0, 5)

  const [showZeroIssues, setShowZeroIssues] = useState(false)
  const [packageOpenOverrides, setPackageOpenOverrides] = useState({})

  const handleTogglePackage = (pkgKey, isOpen) => {
    setPackageOpenOverrides((prev) => ({ ...prev, [pkgKey]: isOpen }))
  }

  const handleExpandAllPackages = () => {
    const next = { aggregate: true }
    for (let i = 0; i < activePackages.length; i++) {
      const pkg = activePackages[i]
      const key = pkg.path || (pkg.dir ? `${pkg.dir}/${pkg.name || 'pkg'}` : pkg.name) || `pkg-${i}`
      next[key] = true
    }
    setPackageOpenOverrides(next)
  }

  const handleCollapseAllPackages = () => {
    setPackageOpenOverrides({ aggregate: false, __allClosed: true })
  }

  const isPackageOpen = (pkgKey, isFirstWithIssues) => {
    if (packageOpenOverrides[pkgKey] !== undefined) {
      return Boolean(packageOpenOverrides[pkgKey])
    }
    if (packageOpenOverrides.__allClosed) {
      return false
    }
    return Boolean(isFirstWithIssues)
  }

  const unusedAggregateCount = includeNonProd
    ? (summary.declaredButUnused?.length || 0) + (summary.nonProduction?.declaredButUnused || 0)
    : (summary.declaredButUnused?.length || 0)
  const undeclaredAggregateCount = includeNonProd
    ? (summary.usedButUndeclared?.length || 0) + (summary.nonProduction?.usedButUndeclared || 0)
    : (summary.usedButUndeclared?.length || 0)
  const nonProdPackagesCount = summary.nonProduction?.packages || 0
  const totalPackagesCount = activePackages.length > 0 ? activePackages.length : (summary.packages?.length || 1)
  const nonProdPkgSuffix = (!includeNonProd && nonProdPackagesCount > 0)
    ? ` (+${nonProdPackagesCount.toLocaleString()} in tests/fixtures)`
    : ''
  const aggregateSummaryText = `${unusedAggregateCount} unused, ${undeclaredAggregateCount} undeclared across ${totalPackagesCount} ${totalPackagesCount === 1 ? 'package' : 'packages'}${nonProdPkgSuffix}`

  // Transitive impact folder grouping, test separation, and collapse controls (scoped by inspected file)
  const [showAllFoldersByFile, setShowAllFoldersByFile] = useState({})
  const showAllFolders = Boolean(showAllFoldersByFile[activeFile])

  const [folderOpenStateByFile, setFolderOpenStateByFile] = useState({})
  const folderOpenState = useMemo(() => folderOpenStateByFile[activeFile] || {}, [folderOpenStateByFile, activeFile])

  const handleToggleFolder = (folderKey, isOpen) => {
    setFolderOpenStateByFile((prev) => ({
      ...prev,
      [activeFile]: {
        ...(prev[activeFile] || {}),
        [folderKey]: isOpen,
      },
    }))
  }

  const { transitiveSortedFolders, transitiveTestsList, transitiveSourceCount } = useMemo(() => {
    const testFiles = []
    const sourceFolders = {}
    let sourceCount = 0

    const pathToNodeMap = new Map()
    if (graph.nodes) {
      for (const n of graph.nodes) {
        pathToNodeMap.set(n.path, n)
      }
    }

    for (const f of fileImpact.transitive) {
      const node = pathToNodeMap.get(f)
      const isTest = node
        ? (node.category !== 'production' || Boolean(node.isTest))
        : /(\.(test|spec)\.|__tests__\/|^tests?\/)/i.test(f)

      if (isTest) {
        testFiles.push(f)
      } else {
        sourceCount++
        const parts = f.split('/')
        const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
        if (!sourceFolders[folder]) {
          sourceFolders[folder] = []
        }
        sourceFolders[folder].push(f)
      }
    }

    const sortedFolders = Object.entries(sourceFolders)
      .map(([folder, files]) => ({ folder, files, count: files.length }))
      .sort((a, b) => b.count - a.count)

    return {
      transitiveSortedFolders: sortedFolders,
      transitiveTestsList: testFiles,
      transitiveSourceCount: sourceCount,
    }
  }, [fileImpact.transitive, graph.nodes])

  const displayedTransitiveFolders = showAllFolders
    ? transitiveSortedFolders
    : transitiveSortedFolders.slice(0, 5)

  const handleExpandAllFolders = () => {
    const next = {}
    for (const item of transitiveSortedFolders) {
      next[item.folder] = true
    }
    next['__tests__'] = true
    setFolderOpenStateByFile((prev) => ({
      ...prev,
      [activeFile]: next,
    }))
  }

  const handleCollapseAllFolders = () => {
    setFolderOpenStateByFile((prev) => ({
      ...prev,
      [activeFile]: {},
    }))
  }

  const toggleShowAllFolders = () => {
    setShowAllFoldersByFile((prev) => ({
      ...prev,
      [activeFile]: !prev[activeFile],
    }))
  }

  // Legacy state: analysis without a scan data and not currently scanning
  if (!hasData && !isScanning) {
    return (
      <section className="codemap-panel" aria-labelledby="codemap-heading">
        <div className="codemap-header">
          <div>
            <p className="eyebrow">Repository Structure</p>
            <h3 id="codemap-heading">Code Map</h3>
          </div>
          <div className="codemap-actions">
            <button
              type="button"
              className="codemap-rerun-btn primary-button"
              onClick={onRerun}
              disabled={isScanning}
              aria-label="Re-run deep scan"
            >
              Re-run deep scan
            </button>
          </div>
        </div>

        {isError ? (
          <div className="codemap-error-alert" role="alert">
            <span className="error-badge">Scan failed</span>
            <p className="error-message">{error}</p>
          </div>
        ) : (
          <div className="codemap-legacy-state" role="status">
            <p className="codemap-muted-copy">
              No deep scan available for this analysis. Click &quot;Re-run deep scan&quot; to inspect all files and dependency paths.
            </p>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="codemap-panel" aria-labelledby="codemap-heading">
      {/* Panel Header & Inline Status */}
      <div className="codemap-header">
        <div>
          <p className="eyebrow">Repository Structure</p>
          <div className="codemap-title-row">
            <h3 id="codemap-heading">Code Map</h3>
            <span
              className={`codemap-inline-status ${isScanning ? 'status-scanning' : isError ? 'status-error' : 'status-complete'}`}
              role="status"
              aria-live="polite"
            >
              {isScanning && (
                <>
                  <span className="status-spinner" aria-hidden="true" />
                  Scanning all files...
                </>
              )}
              {!isScanning && !isError && hasData && (
                `${graphFilesCount.toLocaleString()} code files mapped, ${otherFilesCount.toLocaleString()} other files inventoried, ${skippedCount.toLocaleString()} skipped`
              )}
              {!isScanning && isError && (
                error
              )}
            </span>
          </div>
        </div>

        <div className="codemap-actions">
          <button
            type="button"
            className="codemap-rerun-btn secondary-button"
            onClick={onRerun}
            disabled={isScanning}
            aria-label={isScanning ? 'Scan in progress' : 'Re-run deep scan'}
          >
            {isScanning ? 'Scanning...' : 'Re-run deep scan'}
          </button>
        </div>
      </div>

      {isError && (
        <div className="codemap-error-alert" role="alert">
          <span className="error-badge">Error</span>
          <p className="error-message">{error}</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Top Controls Bar: Production vs Test Toggle */}
          <div className="codemap-controls-bar">
            <label className={`codemap-toggle-label ${!hasNonProdFiles ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={hasNonProdFiles && includeNonProd}
                onChange={(e) => setIncludeNonProd(e.target.checked)}
                disabled={!hasNonProdFiles}
                aria-label="Include tests, fixtures and playground"
              />
              <span>Include tests, fixtures and playground</span>
            </label>
            {!hasNonProdFiles && (
              <span className="codemap-toggle-note">No test files found in this project</span>
            )}
          </div>

          {/* Summary Cards */}
          <div className="codemap-summary-cards" aria-label="Code Map summary metrics">
            <div className="codemap-card">
              <span className="codemap-card-label">Code Files Mapped</span>
              <strong className="codemap-card-value">{graphFilesCount.toLocaleString()}</strong>
              <div className="codemap-card-subline">&nbsp;</div>
            </div>

            <div className="codemap-card">
              <span className="codemap-card-label">Other Files Inventoried</span>
              <strong className="codemap-card-value">
                {otherFilesCount.toLocaleString()}
              </strong>
              <div className="codemap-card-subline">
                {skippedCount > 0 ? `(${skippedCount.toLocaleString()} skipped)` : '\u00A0'}
              </div>
            </div>

            <div className="codemap-card">
              <span className="codemap-card-label">Languages</span>
              <strong className="codemap-card-value">{languageCount.toLocaleString()}</strong>
              <div className="codemap-card-subline">&nbsp;</div>
            </div>

            {entryPoints.length > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-entry-points')}
                aria-label={`View ${entryPoints.length} entry points`}
              >
                <span className="codemap-card-label">Entry Points</span>
                <strong className="codemap-card-value">{entryPoints.length.toLocaleString()}</strong>
                <div className="codemap-card-subline">&nbsp;</div>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Entry Points</span>
                <strong className="codemap-card-value">none</strong>
                <div className="codemap-card-subline">&nbsp;</div>
              </div>
            )}

            {displayedCyclesCount > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-cycles')}
                aria-label={`View ${displayedCyclesCount} circular dependencies`}
              >
                <span className="codemap-card-label">Cycles</span>
                <strong className="codemap-card-value text-warn">
                  {displayedCyclesCount.toLocaleString()}
                </strong>
                <div className="codemap-card-subline">
                  {cyclesSuffix || '\u00A0'}
                </div>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Cycles</span>
                <strong className="codemap-card-value">0</strong>
                <div className="codemap-card-subline">
                  {cyclesSuffix || '\u00A0'}
                </div>
              </div>
            )}

            {displayedOrphansCount > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-orphans')}
                aria-label={`View ${displayedOrphansCount} orphan files`}
              >
                <span className="codemap-card-label">Orphans</span>
                <strong className="codemap-card-value">
                  {displayedOrphansCount.toLocaleString()}
                </strong>
                <div className="codemap-card-subline">
                  {orphansSuffix || '\u00A0'}
                </div>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Orphans</span>
                <strong className="codemap-card-value">0</strong>
                <div className="codemap-card-subline">
                  {orphansSuffix || '\u00A0'}
                </div>
              </div>
            )}

            {displayedUnresolvedCount > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={toggleUnresolvedPanel}
                aria-expanded={showUnresolvedPanel}
                aria-controls="codemap-unresolved-panel"
                aria-label={`Toggle unresolved imports panel (${displayedUnresolvedCount} unresolved)`}
              >
                <span className="codemap-card-label">Unresolved Imports</span>
                <strong className="codemap-card-value text-warn">
                  {displayedUnresolvedCount.toLocaleString()}
                </strong>
                <div className="codemap-card-subline">
                  {unresolvedSuffix || '\u00A0'}
                </div>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Unresolved Imports</span>
                <strong className="codemap-card-value">
                  none
                </strong>
                <div className="codemap-card-subline">
                  {unresolvedSuffix || '\u00A0'}
                </div>
              </div>
            )}
          </div>

          {/* Unresolved Imports Panel */}
          {showUnresolvedPanel && (
            <div
              id="codemap-unresolved-panel"
              ref={unresolvedPanelRef}
              className="codemap-unresolved-panel"
              role="region"
              aria-label="Unresolved imports breakdown"
            >
              <div className="codemap-unresolved-header">
                <h4 className="codemap-unresolved-title">
                  Unresolved imports ({displayedUnresolved.length})
                </h4>
                <label className={`codemap-toggle-label ${!hasNonProdFiles ? 'disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={hasNonProdFiles && includeNonProd}
                    onChange={(e) => setIncludeNonProd(e.target.checked)}
                    disabled={!hasNonProdFiles}
                    aria-label="Include tests, fixtures and playground"
                  />
                  <span>Include tests, fixtures and playground</span>
                </label>
                {!hasNonProdFiles && (
                  <span className="codemap-toggle-note">No test files found in this project</span>
                )}
              </div>

              {unresolvedTruncated && (
                <div className="codemap-truncated-notice" role="alert">
                  Analysis capped at 500 unresolved imports. Additional imports omitted.
                </div>
              )}

              {displayedUnresolved.length === 0 ? (
                <p className="codemap-empty-note">No unresolved imports match the current filter.</p>
              ) : (
                <div className="codemap-reasons-container">
                  {Object.entries(groupedByReason).map(([reasonKey, items]) => {
                    if (items.length === 0) return null
                    const meta = REASON_METADATA[reasonKey] || {
                      title: reasonKey,
                      explanation: 'unresolved import',
                    }
                    const isExpanded = Boolean(expandedReasons[reasonKey])
                    const displayedItems = isExpanded ? items : items.slice(0, 30)
                    const hasMore = items.length > 30

                    return (
                      <details key={`reason-grp-${reasonKey}`} open className="codemap-reason-group">
                        <summary className="codemap-reason-summary">
                          <strong>{meta.title} ({items.length})</strong>
                          <span className="codemap-reason-explanation"> — {meta.explanation}</span>
                        </summary>
                        <div className="codemap-reason-table-wrap">
                          <table className="codemap-unresolved-table">
                            <thead>
                              <tr>
                                <th scope="col">Importing File</th>
                                <th scope="col">Specifier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayedItems.map((item, idx) => (
                                <tr key={`unres-${reasonKey}-${item.from}-${item.specifier}-${idx}`}>
                                  <td className="unresolved-from-cell">
                                    <button
                                      type="button"
                                      className="codemap-link-button"
                                      onClick={() => handleInspectFile(item.from)}
                                      aria-label={`Inspect ${item.from}`}
                                      title={item.from}
                                    >
                                      {item.from}
                                    </button>
                                  </td>
                                  <td className="unresolved-specifier-cell">
                                    <code className="unresolved-specifier-code font-mono" title={item.specifier}>
                                      {item.specifier}
                                    </code>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {hasMore && (
                            <div className="codemap-show-more-wrap">
                              <button
                                type="button"
                                className="codemap-show-more-btn"
                                onClick={() => toggleExpandReason(reasonKey)}
                                aria-label={isExpanded ? `Show fewer ${meta.title}` : `Show all ${items.length} ${meta.title}`}
                              >
                                {isExpanded ? 'Show fewer' : `Show all ${items.length}`}
                              </button>
                            </div>
                          )}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Approximate Analysis Notice */}
          <div className="codemap-approximate-notice" role="note" aria-label="Coverage overview">
            <div className="notice-icon-title">
              <span className="notice-badge">Approximate analysis</span>
              <p className="notice-text">
                {coverage.graphNodesOmitted > 0 && (
                  <strong className="notice-omitted-warning">
                    {coverage.graphNodesOmitted} code files omitted from graph due to the 3,000-node cap.{' '}
                  </strong>
                )}
                {coverage.skipped && Object.keys(coverage.skipped).length > 0 && (
                  <span>
                    Skipped: {Object.entries(coverage.skipped)
                      .map(([reason, count]) => `${count} ${reason.replace('_', ' ')}`)
                      .join(', ')}.{' '}
                  </span>
                )}
                {unsupportedSummaryText ? (
                  <span>
                    Non-code and unsupported language files are inventoried only without dependency mapping ({unsupportedSummaryText}).
                  </span>
                ) : (
                  <span>
                    Dependency mapping is limited to supported code files; all other files are inventoried only.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* SECTION 1: Hotspots */}
          <section className="codemap-section" aria-labelledby="heading-hotspots">
            <h4 id="heading-hotspots" className="codemap-section-title">
              Hotspots
            </h4>
            <div className="codemap-two-col">
              <div className="codemap-subcard">
                <h5>Top Fan-In (Most Imported)</h5>
                <p className="codemap-muted-note">Files imported by the highest number of other files.</p>
                {displayedHotspots.byFanIn?.length ? (
                  <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="Top fan-in files">
                    <table className="codemap-table">
                      <thead>
                        <tr>
                          <th scope="col">File</th>
                          <th scope="col">Fan-In</th>
                          <th scope="col" className="col-action">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PaginatedTableRows
                          items={displayedHotspots.byFanIn}
                          limit={30}
                          label="fan-in hotspots"
                          colSpan={3}
                          renderRow={(item) => (
                            <tr key={`fanin-${item.path}`}>
                              <td className="font-mono">{item.path}</td>
                              <td><span className="count-badge">{item.fanIn}</span></td>
                              <td className="col-action">
                                <button
                                  type="button"
                                  className="codemap-link-button"
                                  onClick={() => setSelectedFile(item.path)}
                                  aria-label={`Inspect ${item.path}`}
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          )}
                        />
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="codemap-empty-note">No fan-in hotspots found.</p>
                )}
              </div>

              <div className="codemap-subcard">
                <h5>Highest Impact Files</h5>
                <p className="codemap-muted-note">Files whose modifications affect the largest portion of the repo.</p>
                {displayedHotspots.byTransitiveImpact?.length ? (
                  <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="Highest impact files">
                    <table className="codemap-table">
                      <thead>
                        <tr>
                          <th scope="col">File</th>
                          <th scope="col">Downstream Impact</th>
                          <th scope="col" className="col-action">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PaginatedTableRows
                          items={displayedHotspots.byTransitiveImpact}
                          limit={30}
                          label="impact hotspots"
                          colSpan={3}
                          renderRow={(item) => (
                            <tr key={`impact-${item.path}`}>
                              <td className="font-mono">{item.path}</td>
                              <td>
                                <span className="count-badge">{item.transitiveCount} files</span>
                                <span className="percent-badge"> ({item.percent}%)</span>
                              </td>
                              <td className="col-action">
                                <button
                                  type="button"
                                  className="codemap-link-button"
                                  onClick={() => setSelectedFile(item.path)}
                                  aria-label={`Inspect ${item.path}`}
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          )}
                        />
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="codemap-empty-note">No impact hotspots found.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 2: Circular Dependencies */}
          <section className="codemap-section" aria-labelledby="heading-cycles" id="section-cycles">
            <h4 id="heading-cycles" className="codemap-section-title">
              Circular Dependencies ({displayedCycles.length})
            </h4>
            {displayedCycles.length === 0 ? (
              <p className="codemap-success-note">&#10003; No circular dependencies detected.</p>
            ) : (
              <PaginatedList
                items={displayedCycles}
                limit={30}
                listClassName="codemap-cycles-list"
                listTag="div"
                label="circular dependencies"
                renderItem={(cycle, cIdx) => {
                  const cycleFiles = Array.isArray(cycle) ? cycle : (cycle?.files || [])
                  const shortest = (Array.isArray(cycle?.shortest) && cycle.shortest.length > 0)
                    ? cycle.shortest
                    : cycleFiles
                  const hint = cycle?.hint
                  const loopDisplay = (shortest.length > 1 && shortest[0] !== shortest[shortest.length - 1])
                    ? [...shortest, shortest[0]]
                    : shortest
                  const loopStr = loopDisplay.join(' → ')

                  return (
                    <details key={`cycle-${cIdx}`} className="codemap-cycle-item">
                      <summary className="codemap-cycle-summary">
                        <strong>Cycle {cIdx + 1}</strong>: <span className="cycle-loop font-mono">{loopStr}</span>
                        {hint && <span className="cycle-hint"> — {hint}</span>}
                      </summary>
                      <ol className="codemap-cycle-files">
                        {cycleFiles.map((filePath, fIdx) => (
                          <li key={`cycle-${cIdx}-${filePath}-${fIdx}`}>
                            <button
                              type="button"
                              className="codemap-link-button"
                              onClick={() => setSelectedFile(filePath)}
                              aria-label={`Inspect ${filePath}`}
                            >
                              {filePath}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )
                }}
              />
            )}

            {/* Type-only cycles reported separately with explicit label */}
            {typeOnlyCycles.length > 0 && (
              <div className="codemap-type-only-cycles">
                <div className="type-only-cycles-header">
                  <h5 className="type-only-cycles-title">Type-Only Cycles ({typeOnlyCycles.length})</h5>
                  <span className="type-only-badge">type-only, no runtime effect</span>
                </div>
                <PaginatedList
                  items={typeOnlyCycles}
                  limit={30}
                  listClassName="codemap-cycles-list"
                  listTag="div"
                  label="type-only cycles"
                  renderItem={(cycle, cIdx) => {
                    const cycleFiles = Array.isArray(cycle) ? cycle : (cycle?.files || [])
                    const shortest = (Array.isArray(cycle?.shortest) && cycle.shortest.length > 0)
                      ? cycle.shortest
                      : cycleFiles
                    const hint = cycle?.hint
                    const loopDisplay = (shortest.length > 1 && shortest[0] !== shortest[shortest.length - 1])
                      ? [...shortest, shortest[0]]
                      : shortest
                    const loopStr = loopDisplay.join(' → ')

                    return (
                      <details key={`type-cycle-${cIdx}`} className="codemap-cycle-item">
                        <summary className="codemap-cycle-summary">
                          <strong>Type Cycle {cIdx + 1}</strong>: <span className="cycle-loop font-mono">{loopStr}</span>
                          {hint && <span className="cycle-hint"> — {hint}</span>}
                        </summary>
                        <ol className="codemap-cycle-files">
                          {cycleFiles.map((filePath, fIdx) => (
                            <li key={`type-cycle-${cIdx}-${filePath}-${fIdx}`}>
                              <button
                                type="button"
                                className="codemap-link-button"
                                onClick={() => setSelectedFile(filePath)}
                                aria-label={`Inspect ${filePath}`}
                              >
                                {filePath}
                              </button>
                            </li>
                          ))}
                        </ol>
                      </details>
                    )
                  }}
                />
              </div>
            )}
          </section>

          {/* SECTION 3: Orphan Files */}
          <section className="codemap-section" aria-labelledby="heading-orphans" id="section-orphans">
            <h4 id="heading-orphans" className="codemap-section-title">
              Orphan Files ({displayedOrphansList.length})
            </h4>
            {displayedOrphansList.length === 0 ? (
              <p className="codemap-success-note">&#10003; No orphan files detected.</p>
            ) : (
              <div className="codemap-orphans-wrap">
                <p className="codemap-muted-note">
                  Files with zero incoming and zero outgoing project dependencies:
                </p>
                <PaginatedList
                  items={displayedOrphansList}
                  limit={30}
                  listClassName="codemap-tags-list"
                  label="orphan files"
                  renderItem={(orphan) => (
                    <li key={`orphan-${orphan}`}>
                      <button
                        type="button"
                        className="codemap-file-chip"
                        onClick={() => setSelectedFile(orphan)}
                        aria-label={`Inspect orphan file ${orphan}`}
                        title={orphan}
                      >
                        {orphan}
                      </button>
                    </li>
                  )}
                />
              </div>
            )}
          </section>

          {/* SECTION: Entry Points */}
          <section className="codemap-section" aria-labelledby="heading-entry-points" id="section-entry-points">
            <h4 id="heading-entry-points" className="codemap-section-title">
              Entry Points ({entryPoints.length})
            </h4>
            {entryPoints.length === 0 ? (
              <p className="codemap-empty-note">No entry points detected.</p>
            ) : (
              <div className="codemap-entrypoints-wrap">
                <p className="codemap-muted-note">
                  Conventional roots, HTML files, binaries, scripts, and exported targets:
                </p>
                <PaginatedList
                  items={entryPoints}
                  limit={30}
                  listClassName="codemap-tags-list"
                  label="entry points"
                  renderItem={(ep) => (
                    <li key={`entrypoint-${ep}`}>
                      <button
                        type="button"
                        className="codemap-file-chip"
                        onClick={() => handleInspectFile(ep)}
                        aria-label={`Inspect entry point ${ep}`}
                        title={ep}
                      >
                        {ep}
                      </button>
                    </li>
                  )}
                />
              </div>
            )}
          </section>

          {/* SECTION 4: Dependencies */}
          <section className="codemap-section" aria-labelledby="heading-dependencies">
            <div className="codemap-section-header-row">
              <h4 id="heading-dependencies" className="codemap-section-title">
                Dependencies
              </h4>
              {activePackages.length > 0 && (
                <div className="codemap-expand-collapse-bar">
                  <button
                    type="button"
                    className="codemap-action-btn"
                    onClick={handleExpandAllPackages}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    className="codemap-action-btn"
                    onClick={handleCollapseAllPackages}
                  >
                    Collapse all
                  </button>
                </div>
              )}
            </div>

            {/* Aggregate section on top (closed by default) */}
            {activePackages.length > 0 ? (
              <details
                className="codemap-package-group aggregate-group"
                open={packageOpenOverrides.aggregate ? true : undefined}
                onToggle={(e) => handleTogglePackage('aggregate', e.currentTarget.open)}
              >
                <summary className="codemap-package-summary">
                  <strong>All packages (aggregate)</strong>
                  <span className="pkg-counts-meta">
                    {' '}— {aggregateSummaryText}
                  </span>
                </summary>
                <div className="codemap-two-col">
                  <div className="codemap-subcard">
                    <h5>Declared but Unused ({summary.declaredButUnused?.length || 0})</h5>
                    {summary.declaredButUnused?.length ? (
                      <>
                        <PaginatedList
                          items={summary.declaredButUnused}
                          limit={30}
                          listClassName="codemap-tags-list"
                          label="unused dependencies"
                          renderItem={(pkg) => (
                            <li key={`unused-${pkg}`} className="codemap-dep-tag unused">
                              {pkg}
                            </li>
                          )}
                        />
                        <p className="codemap-dep-note">
                          {summary.declaredButUnusedNote || 'may be used via config or string references'}
                        </p>
                      </>
                    ) : (
                      <p className="codemap-success-note">&#10003; All declared dependencies are used.</p>
                    )}

                    <h5 className="margin-top-16">Used but Undeclared ({summary.usedButUndeclared?.length || 0})</h5>
                    {summary.usedButUndeclared?.length ? (
                      <PaginatedList
                        items={summary.usedButUndeclared}
                        limit={30}
                        listClassName="codemap-tags-list"
                        label="undeclared dependencies"
                        renderItem={(pkg) => {
                          const sources = summary.undeclaredSources?.[pkg] || []
                          return (
                            <li key={`undeclared-${pkg}`} className="codemap-dep-tag undeclared">
                              <span className="dep-name">{pkg}</span>
                              {sources.length > 0 && (
                                <span className="undeclared-sources-list" title={sources.join(', ')}>
                                  {' '}(used in: {sources.slice(0, 3).join(', ')})
                                </span>
                              )}
                            </li>
                          )
                        }}
                      />
                    ) : (
                      <p className="codemap-success-note">&#10003; No undeclared external dependencies used.</p>
                    )}
                  </div>

                  <div className="codemap-subcard">
                    <h5>External Usage Counts</h5>
                    {graph.externals?.length ? (
                      <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="External dependency usage counts">
                        <table className="codemap-table">
                          <thead>
                            <tr>
                              <th scope="col">Package</th>
                              <th scope="col">Import Count</th>
                              <th scope="col">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            <PaginatedTableRows
                              items={graph.externals}
                              limit={30}
                              label="external dependencies"
                              colSpan={3}
                              renderRow={(ext) => (
                                <tr key={`ext-${ext.name}`}>
                                  <td className="font-mono">{ext.name}</td>
                                  <td><span className="count-badge">{ext.count}</span></td>
                                  <td>
                                    <span className={`status-pill ${ext.declared ? 'pill-declared' : 'pill-undeclared'}`}>
                                      {ext.declared ? 'Declared' : 'Undeclared'}
                                    </span>
                                  </td>
                                </tr>
                              )}
                            />
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="codemap-empty-note">No external package imports detected.</p>
                    )}
                  </div>
                </div>
              </details>
            ) : (
              <div>
                <p className="codemap-aggregate-summary-line font-medium mb-12">
                  {aggregateSummaryText}
                </p>
                <div className="codemap-two-col">
                  <div className="codemap-subcard">
                    <h5>Declared but Unused ({summary.declaredButUnused?.length || 0})</h5>
                    {summary.declaredButUnused?.length ? (
                      <>
                        <PaginatedList
                          items={summary.declaredButUnused}
                          limit={30}
                          listClassName="codemap-tags-list"
                          label="unused dependencies"
                          renderItem={(pkg) => (
                            <li key={`unused-${pkg}`} className="codemap-dep-tag unused">
                              {pkg}
                            </li>
                          )}
                        />
                        <p className="codemap-dep-note">
                          {summary.declaredButUnusedNote || 'may be used via config or string references'}
                        </p>
                      </>
                    ) : (
                      <p className="codemap-success-note">&#10003; All declared dependencies are used.</p>
                    )}

                    <h5 className="margin-top-16">Used but Undeclared ({summary.usedButUndeclared?.length || 0})</h5>
                    {summary.usedButUndeclared?.length ? (
                      <PaginatedList
                        items={summary.usedButUndeclared}
                        limit={30}
                        listClassName="codemap-tags-list"
                        label="undeclared dependencies"
                        renderItem={(pkg) => {
                          const sources = summary.undeclaredSources?.[pkg] || []
                          return (
                            <li key={`undeclared-${pkg}`} className="codemap-dep-tag undeclared">
                              <span className="dep-name">{pkg}</span>
                              {sources.length > 0 && (
                                <span className="undeclared-sources-list" title={sources.join(', ')}>
                                  {' '}(used in: {sources.slice(0, 3).join(', ')})
                                </span>
                              )}
                            </li>
                          )
                        }}
                      />
                    ) : (
                      <p className="codemap-success-note">&#10003; No undeclared external dependencies used.</p>
                    )}
                  </div>

                  <div className="codemap-subcard">
                    <h5>External Usage Counts</h5>
                    {graph.externals?.length ? (
                      <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="External dependency usage counts">
                        <table className="codemap-table">
                          <thead>
                            <tr>
                              <th scope="col">Package</th>
                              <th scope="col">Import Count</th>
                              <th scope="col">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            <PaginatedTableRows
                              items={graph.externals}
                              limit={30}
                              label="external dependencies"
                              colSpan={3}
                              renderRow={(ext) => (
                                <tr key={`ext-${ext.name}`}>
                                  <td className="font-mono">{ext.name}</td>
                                  <td><span className="count-badge">{ext.count}</span></td>
                                  <td>
                                    <span className={`status-pill ${ext.declared ? 'pill-declared' : 'pill-undeclared'}`}>
                                      {ext.declared ? 'Declared' : 'Undeclared'}
                                    </span>
                                  </td>
                                </tr>
                              )}
                            />
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="codemap-empty-note">No external package imports detected.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Packages with issues (sorted, capped at 5, only first open by default) */}
            {packagesWithIssues.length > 0 && (
              <div className="codemap-packages-container">
                {displayedIssuesPackages.map((pkg, idx) => {
                  const pkgKey = pkg.path || (pkg.dir ? `${pkg.dir}/${pkg.name || 'pkg'}` : pkg.name) || `pkg-${idx}`
                  const isOpen = isPackageOpen(pkgKey, idx === 0)
                  return (
                    <details
                      key={pkgKey}
                      className="codemap-package-group"
                      open={isOpen ? true : undefined}
                      onToggle={(e) => handleTogglePackage(pkgKey, e.currentTarget.open)}
                    >
                      <summary className="codemap-package-summary">
                        <strong>{pkg.name || pkg.dir || 'package'}</strong>
                        <span className="pkg-counts-meta">
                          {' '}({pkg.dir || '.'}) — Unused: {pkg.declaredButUnused?.length || 0}, Undeclared: {pkg.usedButUndeclared?.length || 0}
                        </span>
                      </summary>
                      <div className="codemap-package-content">
                        <h5>Declared but Unused ({pkg.declaredButUnused?.length || 0})</h5>
                        {pkg.declaredButUnused?.length ? (
                          <>
                            <PaginatedList
                              items={pkg.declaredButUnused}
                              limit={30}
                              listClassName="codemap-tags-list"
                              label="unused dependencies"
                              renderItem={(dep) => (
                                <li key={`pkg-unused-${pkg.name}-${dep}`} className="codemap-dep-tag unused">
                                  {dep}
                                </li>
                              )}
                            />
                            <p className="codemap-dep-note">
                              {pkg.declaredButUnusedNote || summary.declaredButUnusedNote || 'may be used via config or string references'}
                            </p>
                          </>
                        ) : (
                          <p className="codemap-success-note">&#10003; All declared dependencies are used.</p>
                        )}

                        <h5 className="margin-top-16">Used but Undeclared ({pkg.usedButUndeclared?.length || 0})</h5>
                        {pkg.usedButUndeclared?.length ? (
                          <PaginatedList
                            items={pkg.usedButUndeclared}
                            limit={30}
                            listClassName="codemap-tags-list"
                            label="undeclared dependencies"
                            renderItem={(dep) => {
                              const sources = pkg.undeclaredSources?.[dep] || summary.undeclaredSources?.[dep] || []
                              return (
                                <li key={`pkg-undec-${pkg.name}-${dep}`} className="codemap-dep-tag undeclared">
                                  <span className="dep-name">{dep}</span>
                                  {sources.length > 0 && (
                                    <span className="undeclared-sources-list" title={sources.join(', ')}>
                                      {' '}(used in: {sources.slice(0, 3).join(', ')})
                                    </span>
                                  )}
                                </li>
                              )
                            }}
                          />
                        ) : (
                          <p className="codemap-success-note">&#10003; No undeclared external dependencies used.</p>
                        )}
                      </div>
                    </details>
                  )
                })}

                {packagesWithIssues.length > 5 && (
                  <div className="codemap-show-more-wrap">
                    <button
                      type="button"
                      className="codemap-show-more-btn"
                      onClick={() => setShowAllPackages((prev) => !prev)}
                      aria-label={showAllPackages ? 'Show fewer packages' : `Show all ${packagesWithIssues.length} packages`}
                    >
                      {showAllPackages ? 'Show fewer' : `Show all ${packagesWithIssues.length} packages`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Zero-issue packages collapsed into one line */}
            {activePackages.length > 1 && zeroIssuePackages.length > 0 && (
              <div className="codemap-zero-issues-section">
                <div className="codemap-zero-issues-row">
                  <span className="zero-issues-text">
                    {zeroIssuePackages.length === 1
                      ? '1 other package has no issues'
                      : `${zeroIssuePackages.length} other packages have no issues`}
                  </span>
                  <button
                    type="button"
                    className="codemap-link-button show-zero-issues-btn"
                    onClick={() => setShowZeroIssues((prev) => !prev)}
                    aria-expanded={showZeroIssues}
                  >
                    {showZeroIssues ? 'Hide them' : 'Show them'}
                  </button>
                </div>
                {showZeroIssues && (
                  <div className="codemap-packages-container zero-issues-list">
                    {zeroIssuePackages.map((pkg, idx) => {
                      const pkgKey = pkg.path || (pkg.dir ? `${pkg.dir}/${pkg.name || 'pkg'}` : pkg.name) || `zero-pkg-${idx}`
                      const isOpen = Boolean(packageOpenOverrides[pkgKey])
                      return (
                        <details
                          key={pkgKey}
                          className="codemap-package-group zero-issue-group"
                          open={isOpen ? true : undefined}
                          onToggle={(e) => handleTogglePackage(pkgKey, e.currentTarget.open)}
                        >
                          <summary className="codemap-package-summary">
                            <strong>{pkg.name || pkg.dir || 'package'}</strong>
                            <span className="pkg-counts-meta">
                              {' '}({pkg.dir || '.'}) — 0 issues
                            </span>
                          </summary>
                          <div className="codemap-package-content">
                            <p className="codemap-success-note">&#10003; All declared dependencies are used.</p>
                            <p className="codemap-success-note">&#10003; No undeclared external dependencies used.</p>
                          </div>
                        </details>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SECTION 5: Inventory */}
          <section className="codemap-section" aria-labelledby="heading-inventory">
            <h4 id="heading-inventory" className="codemap-section-title">
              Inventory
            </h4>
            <div className="codemap-three-col">
              <div className="codemap-subcard">
                <h5>By Language</h5>
                {(realLanguages.length > 0 || dataAndDocs.length > 0 || otherFileTypes.length > 0) ? (
                  <ul className="codemap-simple-list">
                    {realLanguages.length > 0 && (
                      <>
                        <li className="codemap-list-section-header first-header">
                          <h6 className="by-lang-heading">Languages</h6>
                        </li>
                        {realLanguages.map(({ label, count }) => (
                          <li key={`lang-${label}`}>
                            <span>{label}</span>
                            <strong className="count-badge">{count}</strong>
                          </li>
                        ))}
                      </>
                    )}
                    {dataAndDocs.length > 0 && (
                      <>
                        <li className="codemap-list-section-header">
                          <h6 className="by-lang-heading">Data and docs</h6>
                        </li>
                        {dataAndDocs.map(({ label, count }) => (
                          <li key={`data-${label}`}>
                            <span>{label}</span>
                            <strong className="count-badge">{count}</strong>
                          </li>
                        ))}
                      </>
                    )}
                    {otherFileTypes.length > 0 && (
                      <>
                        <li className="codemap-list-section-header">
                          <h6 className="by-lang-heading other-types-heading">Other file types</h6>
                        </li>
                        {otherFileTypes.map(({ label, count }) => (
                          <li key={`other-type-${label}`}>
                            <span>{label}</span>
                            <strong className="count-badge">{count}</strong>
                          </li>
                        ))}
                      </>
                    )}
                  </ul>
                ) : (
                  <p className="codemap-empty-note">No language data.</p>
                )}
              </div>

              <div className="codemap-subcard">
                <h5>By Folder</h5>
                {inventory.byFolder && Object.keys(inventory.byFolder).length > 0 ? (
                  <PaginatedList
                    items={Object.entries(inventory.byFolder)}
                    limit={30}
                    listClassName="codemap-simple-list"
                    label="folders"
                    renderItem={([folder, count]) => (
                      <li key={`folder-${folder}`}>
                        <span>{folder || '.'}</span>
                        <strong className="count-badge">{count}</strong>
                      </li>
                    )}
                  />
                ) : (
                  <p className="codemap-empty-note">No folder data.</p>
                )}
              </div>

              <div className="codemap-subcard">
                <h5>Largest Files</h5>
                {inventory.largest?.length ? (
                  <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="Largest files">
                    <table className="codemap-table">
                      <thead>
                        <tr>
                          <th scope="col">File</th>
                          <th scope="col">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PaginatedTableRows
                          items={inventory.largest}
                          limit={30}
                          label="largest files"
                          colSpan={2}
                          renderRow={(item) => (
                            <tr key={`largest-${item.path}`}>
                              <td className="font-mono">{item.path}</td>
                              <td>{formatBytes(item.size)}</td>
                            </tr>
                          )}
                        />
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="codemap-empty-note">No size data.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 6: File Explorer */}
          <section className="codemap-section" aria-labelledby="heading-file-explorer">
            <h4 id="heading-file-explorer" className="codemap-section-title">
              File Explorer
            </h4>

            <div className="codemap-explorer-layout">
              {/* Left Column: Search & File List */}
              <div className="codemap-explorer-list-col">
                <div className="codemap-search-box">
                  <label htmlFor="codemap-file-search" className="codemap-search-label">
                    Search analyzed files
                  </label>
                  <input
                    id="codemap-file-search"
                    name="codemapFileSearch"
                    type="search"
                    className="codemap-search-input"
                    placeholder="Search file path..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search analyzed files"
                  />
                  <span className="search-count-note">
                    {filteredNodes.length} of {graph.nodes.length} files
                  </span>
                </div>

                <div className="codemap-files-scroll" role="listbox" aria-label="Analyzed project files">
                  {filteredNodes.length === 0 ? (
                    <p className="codemap-empty-note">No files match &quot;{searchQuery}&quot;</p>
                  ) : (
                    <PaginatedList
                      items={filteredNodes}
                      limit={30}
                      listClassName="codemap-files-paginated-list"
                      listTag="div"
                      label="files"
                      renderItem={(node) => {
                        const isConfig = Boolean(node.isConfig || isConfigFile(node.path))
                        const isTest = Boolean(node.isTest || node.category === 'non-production')
                        return (
                          <button
                            type="button"
                            key={node.path}
                            role="option"
                            title={node.path}
                            aria-selected={node.path === activeFile}
                            className={`codemap-file-entry ${node.path === activeFile ? 'active' : ''}`}
                            onClick={() => setSelectedFile(node.path)}
                          >
                            <span className="file-path" title={node.path}>{node.path}</span>
                            <span className="file-meta">
                              {isConfig && (
                                <span className="file-tag config-tag">CONFIG</span>
                              )}
                              {isTest && (
                                <span className="file-tag test-tag">test</span>
                              )}
                              {' '}{node.lang?.toLowerCase() === 'svg' ? 'SVG' : node.lang}
                            </span>
                          </button>
                        )
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Right Column: File Details, Impact & Neighborhood */}
              <div className="codemap-explorer-detail-col">
                {activeFile ? (
                  <>
                    <div className="codemap-file-header">
                      <p className="eyebrow">Inspecting file</p>
                      <div className="active-file-title-wrap">
                        <h5 className="active-file-title font-mono">{activeFile}</h5>
                        {Boolean(activeNode?.isConfig || isConfigFile(activeFile)) && (
                          <span className="file-tag config-tag">CONFIG</span>
                        )}
                        {Boolean(activeNode?.isTest || activeNode?.category === 'non-production') && (
                          <span className="file-tag test-tag">test</span>
                        )}
                      </div>
                    </div>

                    {cycleImpact.inCycle && (
                      <div className="codemap-cycle-note" role="note" aria-label="Circular dependency warning">
                        <p>
                          This file is part of a circular dependency; impact may be overstated by {cycleImpact.overstatedCount} file{cycleImpact.overstatedCount === 1 ? '' : 's'}.
                        </p>
                      </div>
                    )}

                    {/* Impact Notice */}
                    <div className="codemap-impact-box" aria-label="Downstream modification impact">
                      <div className="impact-header-row">
                        <strong className="impact-headline">
                          Changing this file directly or transitively affects {fileImpact.totalAffected ?? (fileImpact.direct.length + fileImpact.transitive.length)} files, {fileImpact.percentOfRepo}% of the repo
                        </strong>
                      </div>

                      {/* Compact stat row (direct source, direct tests, transitive source, transitive tests) */}
                      <div className="compact-stat-row" aria-label="Impact breakdown">
                        <div className="compact-stat-item">
                          <span className="compact-stat-label">Direct source</span>
                          <strong className="compact-stat-value">{fileImpact.directBreakdown?.source ?? fileImpact.direct.length}</strong>
                        </div>
                        <div className="compact-stat-item">
                          <span className="compact-stat-label">Direct tests</span>
                          <strong className="compact-stat-value">{fileImpact.directBreakdown?.tests ?? 0}</strong>
                        </div>
                        <div className="compact-stat-item">
                          <span className="compact-stat-label">Transitive source</span>
                          <strong className="compact-stat-value">{fileImpact.transitiveBreakdown?.source ?? fileImpact.transitive.length}</strong>
                        </div>
                        <div className="compact-stat-item">
                          <span className="compact-stat-label">Transitive tests</span>
                          <strong className="compact-stat-value">{fileImpact.transitiveBreakdown?.tests ?? 0}</strong>
                        </div>
                      </div>

                      <div className="impact-details-row">
                        <div>
                          <h6>Directly affected ({fileImpact.direct.length}):</h6>
                          {fileImpact.direct.length === 0 ? (
                            <p className="codemap-muted-note">None</p>
                          ) : (
                            <PaginatedList
                              items={fileImpact.direct}
                              limit={5}
                              listClassName="impact-file-list"
                              label="directly affected files"
                              renderItem={(f) => (
                                <li key={`direct-${f}`}>
                                  <button
                                    type="button"
                                    className="codemap-link-button"
                                    onClick={() => setSelectedFile(f)}
                                    aria-label={`Select ${f}`}
                                    title={f}
                                  >
                                    {f}
                                  </button>
                                </li>
                              )}
                            />
                          )}
                        </div>

                        <div>
                          <div className="transitive-header-row">
                            <h6>Transitively affected by folder ({includeNonProd ? fileImpact.transitive.length : transitiveSourceCount}):</h6>
                            {(transitiveSortedFolders.length > 0 || (includeNonProd && transitiveTestsList.length > 0)) && (
                              <div className="codemap-expand-collapse-bar">
                                <button
                                  type="button"
                                  className="codemap-action-btn"
                                  onClick={handleExpandAllFolders}
                                >
                                  Expand all
                                </button>
                                <button
                                  type="button"
                                  className="codemap-action-btn"
                                  onClick={handleCollapseAllFolders}
                                >
                                  Collapse all
                                </button>
                              </div>
                            )}
                          </div>

                          {fileImpact.transitive.length === 0 || (transitiveSortedFolders.length === 0 && (!includeNonProd || transitiveTestsList.length === 0)) ? (
                            <p className="codemap-muted-note">No additional files beyond the direct importers.</p>
                          ) : (
                            <div className="transitive-folders-list">
                              {displayedTransitiveFolders.map(({ folder, files }) => {
                                const folderLabel = (folder === '.' || folder === './') ? 'project root' : `${folder}/`
                                return (
                                  <details
                                    key={`folder-${folder}`}
                                    className="transitive-folder-details"
                                    open={Boolean(folderOpenState[folder])}
                                    onToggle={(e) => handleToggleFolder(folder, e.currentTarget.open)}
                                  >
                                    <summary className="transitive-folder-summary">
                                      <span className="folder-name">{folderLabel}</span>
                                      <strong className="count-badge">{files.length}</strong>
                                    </summary>
                                  <div className="transitive-folder-content">
                                    <PaginatedList
                                      items={files}
                                      limit={5}
                                      listClassName="impact-file-list"
                                      label="files"
                                      renderItem={(f) => (
                                        <li key={`trans-${f}`}>
                                          <button
                                            type="button"
                                            className="codemap-link-button"
                                            onClick={() => setSelectedFile(f)}
                                            aria-label={`Select ${f}`}
                                            title={f}
                                          >
                                            {f}
                                          </button>
                                        </li>
                                      )}
                                    />
                                  </div>
                                </details>
                              )})}

                              {transitiveSortedFolders.length > 5 && (
                                <div className="codemap-show-more-wrap">
                                  <button
                                    type="button"
                                    className="codemap-show-more-btn"
                                    onClick={toggleShowAllFolders}
                                    aria-label={showAllFolders ? 'Show fewer folders' : `Show all ${transitiveSortedFolders.length} folders`}
                                  >
                                    {showAllFolders ? 'Show fewer' : `Show all ${transitiveSortedFolders.length} folders`}
                                  </button>
                                </div>
                              )}

                              {includeNonProd && transitiveTestsList.length > 0 && (
                                <details
                                  className="transitive-folder-details transitive-tests-group"
                                  open={Boolean(folderOpenState['__tests__'])}
                                  onToggle={(e) => handleToggleFolder('__tests__', e.currentTarget.open)}
                                >
                                  <summary className="transitive-folder-summary">
                                    <span className="folder-name">Tests</span>
                                    <strong className="count-badge">{transitiveTestsList.length}</strong>
                                  </summary>
                                  <div className="transitive-folder-content">
                                    <PaginatedList
                                      items={transitiveTestsList}
                                      limit={5}
                                      listClassName="impact-file-list"
                                      label="test files"
                                      renderItem={(f) => (
                                        <li key={`trans-test-${f}`}>
                                          <button
                                            type="button"
                                            className="codemap-link-button"
                                            onClick={() => setSelectedFile(f)}
                                            aria-label={`Select ${f}`}
                                            title={f}
                                          >
                                            {f}
                                          </button>
                                        </li>
                                      )}
                                    />
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* Neighborhood Graph SVG & Text representation */}
                    <NeighborhoodGraph
                      selectedFile={activeFile}
                      imports={activeImports}
                      importers={activeImporters}
                      onSelectFile={(path) => setSelectedFile(path)}
                    />
                  </>
                ) : (
                  <p className="codemap-empty-note">Select a file from the list to view its dependencies and impact.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
