import { useState, useMemo, useRef } from 'react'
import { getImpact, getFileConnections, getCycleOverstatedImpact } from '../../utils/graphImpact.js'
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

function formatLanguageName(lang) {
  if (!lang) return ''
  const map = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    jsx: 'JSX',
    tsx: 'TSX',
    vue: 'Vue',
    py: 'Python',
    python: 'Python',
    rb: 'Ruby',
    ruby: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    rust: 'Rust',
    cpp: 'C++',
    c: 'C',
    java: 'Java',
    php: 'PHP',
    sh: 'Shell',
    shell: 'Shell',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yaml: 'YAML',
    md: 'Markdown',
    markdown: 'Markdown',
    svg: 'SVG',
    sql: 'SQL',
    xml: 'XML',
    graphql: 'GraphQL',
  }
  return map[lang.toLowerCase()] || (lang.charAt(0).toUpperCase() + lang.slice(1))
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

  // Default selected file for file explorer
  const defaultFile = useMemo(() => {
    if (!data?.graph?.nodes?.length) return ''
    const topImpact = data.summary?.hotspots?.byTransitiveImpact?.[0]?.path
    const topFanIn = data.summary?.hotspots?.byFanIn?.[0]?.path
    return topImpact || topFanIn || data.graph.nodes[0].path || ''
  }, [data])

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

  const skippedCount = useMemo(() => {
    const skippedObj = coverage.skipped || inventory.skipped || {}
    return Object.values(skippedObj).reduce((sum, count) => sum + (Number(count) || 0), 0)
  }, [coverage.skipped, inventory.skipped])

  const graphFilesCount = coverage.graphFiles ?? data?.graphFiles ?? graph.nodes?.length ?? 0
  const totalFiles = coverage.totalFiles ?? inventory.totalFiles ?? (graphFilesCount + skippedCount)
  const analyzedFiles = coverage.analyzedFiles ?? inventory.analyzedFiles ?? Math.max(0, totalFiles - skippedCount)

  const otherFilesCount = Math.max(0, analyzedFiles - graphFilesCount)

  const inventoryByLanguageList = useMemo(() => {
    if (!inventory.byLanguage) return []
    const map = new Map()
    for (const [rawLang, rawCount] of Object.entries(inventory.byLanguage)) {
      const count = Number(rawCount) || 0
      const l = rawLang.toLowerCase()
      let label = rawLang
      if (l === 'binary') {
        label = 'Binary'
      } else if (l === 'other' || l === 'gitignore' || l === 'txt') {
        label = 'Other'
      } else if (l === 'svg') {
        label = 'SVG'
      }
      map.set(label, (map.get(label) || 0) + count)
    }
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
  }, [inventory.byLanguage])

  const languageCount = useMemo(() => {
    const nonOtherNonBinary = inventoryByLanguageList.filter(
      (item) => item.label !== 'Binary' && item.label !== 'Other'
    )
    if (inventory.byLanguage && Object.keys(inventory.byLanguage).length > 0) {
      return nonOtherNonBinary.length
    }
    const rawKeys = new Set()
    if (coverage.graphLanguages) {
      for (const k of Object.keys(coverage.graphLanguages)) {
        rawKeys.add(k.toLowerCase())
      }
    }
    if (coverage.inventoryOnlyLanguages) {
      for (const k of Object.keys(coverage.inventoryOnlyLanguages)) {
        rawKeys.add(k.toLowerCase())
      }
    }
    return Array.from(rawKeys).filter((l) => {
      return l !== 'binary' && l !== 'other' && l !== 'gitignore' && l !== 'txt'
    }).length
  }, [inventoryByLanguageList, inventory.byLanguage, coverage.graphLanguages, coverage.inventoryOnlyLanguages])

  const entryPoints = summary.entryPoints || []
  const cycles = useMemo(() => summary.cycles || [], [summary.cycles])
  const configFiles = useMemo(() => summary.configFiles || [], [summary.configFiles])
  const orphans = (summary.orphans || []).filter((p) => !configFiles.includes(p))
  const unresolvedCount = summary.unresolvedCount ?? data?.unresolvedCount ?? (data?.unresolvedImports?.length ?? 0)

  const rawUnresolvedImports = useMemo(() => {
    return data?.unresolvedImports || summary?.unresolvedImports || data?.graph?.unresolvedImports || []
  }, [data, summary])

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
  const hotspots = useMemo(() => {
    const raw = summary.hotspots || { byFanIn: [], byTransitiveImpact: [] }
    return {
      byFanIn: (raw.byFanIn || []).filter((item) => !configFiles.includes(item.path)),
      byTransitiveImpact: (raw.byTransitiveImpact || []).filter((item) => !configFiles.includes(item.path)),
    }
  }, [summary.hotspots, configFiles])

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
      if (l === 'other' || l === 'gitignore' || l === 'txt') {
        otherCount += count
        continue
      }
      if (!graphLangKeys.has(l)) {
        list.push({
          lang,
          name: formatLanguageName(lang),
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
    if (!graph.nodes) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return graph.nodes
    return graph.nodes.filter((node) => node.path.toLowerCase().includes(q))
  }, [graph.nodes, searchQuery])

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
                `Mapped connections for ${graphFilesCount} code files; ${otherFilesCount} other files inventoried only; ${skippedCount} skipped.${unsupportedSummaryText ? ` (${unsupportedSummaryText})` : ''}`
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
          {/* Summary Cards */}
          <div className="codemap-summary-cards" aria-label="Code Map summary metrics">
            <div className="codemap-card">
              <span className="codemap-card-label">Code Files Mapped</span>
              <strong className="codemap-card-value">{graphFilesCount}</strong>
            </div>

            <div className="codemap-card">
              <span className="codemap-card-label">Other Files Inventoried</span>
              <strong className="codemap-card-value">
                {otherFilesCount}
                {skippedCount > 0 && (
                  <span className="codemap-card-sub"> ({skippedCount} skipped)</span>
                )}
              </strong>
            </div>

            <div className="codemap-card">
              <span className="codemap-card-label">Languages</span>
              <strong className="codemap-card-value">{languageCount}</strong>
            </div>

            {entryPoints.length > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-entry-points')}
                aria-label={`View ${entryPoints.length} entry points`}
              >
                <span className="codemap-card-label">Entry Points</span>
                <strong className="codemap-card-value">{entryPoints.length}</strong>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Entry Points</span>
                <strong className="codemap-card-value">none</strong>
              </div>
            )}

            {cycles.length > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-cycles')}
                aria-label={`View ${cycles.length} circular dependencies`}
              >
                <span className="codemap-card-label">Cycles</span>
                <strong className="codemap-card-value text-warn">{cycles.length}</strong>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Cycles</span>
                <strong className="codemap-card-value">0</strong>
              </div>
            )}

            {orphans.length > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={() => scrollToSection('heading-orphans')}
                aria-label={`View ${orphans.length} orphan files`}
              >
                <span className="codemap-card-label">Orphans</span>
                <strong className="codemap-card-value">{orphans.length}</strong>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Orphans</span>
                <strong className="codemap-card-value">0</strong>
              </div>
            )}

            {unresolvedCount > 0 ? (
              <button
                type="button"
                className="codemap-card codemap-card-button"
                onClick={toggleUnresolvedPanel}
                aria-expanded={showUnresolvedPanel}
                aria-controls="codemap-unresolved-panel"
                aria-label={`Toggle unresolved imports panel (${unresolvedCount} unresolved)`}
              >
                <span className="codemap-card-label">Unresolved Imports</span>
                <strong className="codemap-card-value text-warn">{unresolvedCount}</strong>
              </button>
            ) : (
              <div className="codemap-card">
                <span className="codemap-card-label">Unresolved Imports</span>
                <strong className="codemap-card-value">none</strong>
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
                <label className="codemap-toggle-label">
                  <input
                    type="checkbox"
                    checked={includeNonProd}
                    onChange={(e) => setIncludeNonProd(e.target.checked)}
                    aria-label="Include tests, fixtures and playground"
                  />
                  <span>Include tests, fixtures and playground</span>
                </label>
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
                {hotspots.byFanIn?.length ? (
                  <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="Top fan-in files">
                    <table className="codemap-table">
                      <thead>
                        <tr>
                          <th scope="col">File</th>
                          <th scope="col">Fan-In</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotspots.byFanIn.slice(0, 5).map((item) => (
                          <tr key={`fanin-${item.path}`}>
                            <td className="font-mono">{item.path}</td>
                            <td><span className="count-badge">{item.fanIn}</span></td>
                            <td>
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
                        ))}
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
                {hotspots.byTransitiveImpact?.length ? (
                  <div className="codemap-table-wrap" tabIndex={0} role="region" aria-label="Highest impact files">
                    <table className="codemap-table">
                      <thead>
                        <tr>
                          <th scope="col">File</th>
                          <th scope="col">Downstream Impact</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotspots.byTransitiveImpact.slice(0, 5).map((item) => (
                          <tr key={`impact-${item.path}`}>
                            <td className="font-mono">{item.path}</td>
                            <td>
                              <span className="count-badge">{item.transitiveCount} files</span>
                              <span className="percent-badge"> ({item.percent}%)</span>
                            </td>
                            <td>
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
                        ))}
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
              Circular Dependencies ({cycles.length})
            </h4>
            {cycles.length === 0 ? (
              <p className="codemap-success-note">&#10003; No circular dependencies detected.</p>
            ) : (
              <div className="codemap-cycles-list">
                {cycles.map((cycle, cIdx) => {
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
                })}

              </div>
            )}
          </section>

          {/* SECTION 3: Orphan Files */}
          <section className="codemap-section" aria-labelledby="heading-orphans" id="section-orphans">
            <h4 id="heading-orphans" className="codemap-section-title">
              Orphan Files ({orphans.length})
            </h4>
            {orphans.length === 0 ? (
              <p className="codemap-success-note">&#10003; No orphan files detected.</p>
            ) : (
              <div className="codemap-orphans-wrap">
                <p className="codemap-muted-note">
                  Files with zero incoming and zero outgoing project dependencies:
                </p>
                <ul className="codemap-tags-list">
                  {orphans.map((orphan) => (
                    <li key={`orphan-${orphan}`}>
                      <button
                        type="button"
                        className="codemap-file-chip"
                        onClick={() => setSelectedFile(orphan)}
                        aria-label={`Inspect orphan file ${orphan}`}
                      >
                        {orphan}
                      </button>
                    </li>
                  ))}
                </ul>
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
                <ul className="codemap-tags-list">
                  {entryPoints.map((ep) => (
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
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* SECTION 4: Dependencies */}
          <section className="codemap-section" aria-labelledby="heading-dependencies">
            <h4 id="heading-dependencies" className="codemap-section-title">
              Dependencies
            </h4>
            <div className="codemap-two-col">
              <div className="codemap-subcard">
                <h5>Declared but Unused ({summary.declaredButUnused?.length || 0})</h5>
                {summary.declaredButUnused?.length ? (
                  <ul className="codemap-tags-list">
                    {summary.declaredButUnused.map((pkg) => (
                      <li key={`unused-${pkg}`} className="codemap-dep-tag unused">
                        {pkg}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="codemap-success-note">&#10003; All declared dependencies are used.</p>
                )}

                <h5 className="margin-top-16">Used but Undeclared ({summary.usedButUndeclared?.length || 0})</h5>
                {summary.usedButUndeclared?.length ? (
                  <ul className="codemap-tags-list">
                    {summary.usedButUndeclared.map((pkg) => (
                      <li key={`undeclared-${pkg}`} className="codemap-dep-tag undeclared">
                        {pkg}
                      </li>
                    ))}
                  </ul>
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
                        {graph.externals.slice(0, 10).map((ext) => (
                          <tr key={`ext-${ext.name}`}>
                            <td className="font-mono">{ext.name}</td>
                            <td><span className="count-badge">{ext.count}</span></td>
                            <td>
                              <span className={`status-pill ${ext.declared ? 'pill-declared' : 'pill-undeclared'}`}>
                                {ext.declared ? 'Declared' : 'Undeclared'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="codemap-empty-note">No external package imports detected.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 5: Inventory */}
          <section className="codemap-section" aria-labelledby="heading-inventory">
            <h4 id="heading-inventory" className="codemap-section-title">
              Inventory
            </h4>
            <div className="codemap-three-col">
              <div className="codemap-subcard">
                <h5>By Language</h5>
                {inventoryByLanguageList.length > 0 ? (
                  <ul className="codemap-simple-list">
                    {inventoryByLanguageList.map(({ label, count }) => (
                      <li key={`lang-${label}`}>
                        <span>{label}</span>
                        <strong className="count-badge">{count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="codemap-empty-note">No language data.</p>
                )}
              </div>

              <div className="codemap-subcard">
                <h5>By Folder</h5>
                {inventory.byFolder && Object.keys(inventory.byFolder).length > 0 ? (
                  <ul className="codemap-simple-list">
                    {Object.entries(inventory.byFolder).slice(0, 8).map(([folder, count]) => (
                      <li key={`folder-${folder}`}>
                        <span>{folder || '.'}</span>
                        <strong className="count-badge">{count}</strong>
                      </li>
                    ))}
                  </ul>
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
                        {inventory.largest.slice(0, 6).map((item) => (
                          <tr key={`largest-${item.path}`}>
                            <td className="font-mono">{item.path}</td>
                            <td>{formatBytes(item.size)}</td>
                          </tr>
                        ))}
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
                    filteredNodes.map((node) => (
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
                          {node.isConfig && (
                            <span className="file-tag config-tag">config</span>
                          )}
                          {node.isTest && (
                            <span className="file-tag test-tag">test</span>
                          )}
                          {' '}{node.lang?.toLowerCase() === 'svg' ? 'SVG' : node.lang}
                        </span>
                      </button>
                    ))
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
                        {activeNode?.isConfig && (
                          <span className="file-tag config-tag">config</span>
                        )}
                        {activeNode?.isTest && (
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

                      <div className="impact-details-row">
                        <div>
                          <h6>Directly affected ({fileImpact.direct.length}):</h6>
                          {fileImpact.direct.length === 0 ? (
                            <p className="codemap-muted-note">None</p>
                          ) : (
                            <ul className="impact-file-list">
                              {fileImpact.direct.map((f) => (
                                <li key={`direct-${f}`}>
                                  <button
                                    type="button"
                                    className="codemap-link-button"
                                    onClick={() => setSelectedFile(f)}
                                    aria-label={`Select ${f}`}
                                  >
                                    {f}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <h6>Transitively affected by folder:</h6>
                          {fileImpact.transitive.length === 0 ? (
                            <p className="codemap-muted-note">No additional files beyond the direct importers.</p>
                          ) : (
                            <div className="transitive-folders-list">
                              {Object.entries(fileImpact.transitiveByFolder).map(([folder, files]) => (
                                <div key={`folder-${folder}`} className="transitive-folder-group">
                                  <strong>{folder}/ ({files.length})</strong>
                                  <ul>
                                    {files.slice(0, 4).map((f) => (
                                      <li key={`trans-${f}`}>
                                        <button
                                          type="button"
                                          className="codemap-link-button"
                                          onClick={() => setSelectedFile(f)}
                                          aria-label={`Select ${f}`}
                                        >
                                          {f}
                                        </button>
                                      </li>
                                    ))}
                                    {files.length > 4 && (
                                      <li className="codemap-more-note">
                                        +{files.length - 4} more in {folder}
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* Neighborhood Graph SVG & Text representation */}
                    <NeighborhoodGraph
                      selectedFile={activeFile}
                      imports={fileConnections.imports}
                      importers={fileConnections.importers}
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
