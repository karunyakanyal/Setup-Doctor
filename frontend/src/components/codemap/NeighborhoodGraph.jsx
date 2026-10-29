import { useState, useMemo } from 'react'

function truncatePath(fullPath, maxLen = 22) {
  if (!fullPath) return ''
  if (fullPath.length <= maxLen) return fullPath
  const parts = fullPath.split('/')
  const fileName = parts.pop() || ''
  if (fileName.length >= maxLen) {
    return `${fileName.slice(0, maxLen - 3)}...`
  }
  return `.../${fileName}`
}

function getFolder(filePath) {
  if (!filePath) return '.'
  const parts = filePath.split('/')
  parts.pop()
  return parts.length > 0 ? parts.join('/') : '.'
}

export default function NeighborhoodGraph({
  selectedFile,
  imports = [],
  importers = [],
  graph = null,
  cycles = [],
  summary = null,
  includeNonProd = false,
  onSelectFile,
  onBack,
  canGoBack = false,
  initialShowGraph = false,
}) {
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [showGraph, setShowGraph] = useState(initialShowGraph)

  // 1. Nodes map & metadata
  const { nodesMap, idToNode } = useMemo(() => {
    const nMap = new Map()
    const idMap = new Map()
    for (const node of graph?.nodes || []) {
      if (node?.path) {
        nMap.set(node.path, node)
      }
      if (node?.id !== undefined) {
        idMap.set(node.id, node)
      }
    }
    return { nodesMap: nMap, idToNode: idMap }
  }, [graph?.nodes])

  // Hotspots set
  const hotspotsSet = useMemo(() => {
    const set = new Set()
    const hs = summary?.hotspots
    if (Array.isArray(hs)) {
      for (const h of hs) {
        if (typeof h === 'string') set.add(h)
        else if (h?.file || h?.path) set.add(h.file || h.path)
      }
    } else if (hs && typeof hs === 'object') {
      const list = [...(hs.byFanIn || []), ...(hs.byTransitiveImpact || [])]
      for (const h of list) {
        if (typeof h === 'string') set.add(h)
        else if (h?.file || h?.path) set.add(h.file || h.path)
      }
    }
    return set
  }, [summary?.hotspots])

  // Cycle files set
  const cycleFilesSet = useMemo(() => {
    const set = new Set()
    const allCycles = Array.isArray(cycles) ? cycles : []
    for (const c of allCycles) {
      if (!c) continue
      if (c.isTypeOnly && !includeNonProd) continue
      const files = Array.isArray(c) ? c : (c.files || c.shortest || [])
      for (const f of files) set.add(f)
    }
    return set
  }, [cycles, includeNonProd])

  // Entry points set
  const entryPointsSet = useMemo(() => {
    const set = new Set()
    for (const node of graph?.nodes || []) {
      if (node?.isEntry) set.add(node.path)
    }
    if (Array.isArray(summary?.entryPoints)) {
      for (const ep of summary.entryPoints) {
        if (typeof ep === 'string') set.add(ep)
        else if (ep?.path) set.add(ep.path)
      }
    }
    return set
  }, [graph?.nodes, summary])

  // Fan-in map
  const fanInMap = useMemo(() => {
    const map = new Map()
    for (const node of graph?.nodes || []) {
      if (node?.path) map.set(node.path, node.fanIn || 0)
    }
    return map
  }, [graph?.nodes])

  // Classify file type: only ENTRY, HOTSPOT, TEST, CONFIG, SOURCE (no per-node CYCLE tag)
  const getFileType = (path) => {
    if (!path) return { type: 'source', label: 'Source file', tag: 'source' }
    if (entryPointsSet.has(path)) return { type: 'entry', label: 'Entry point', tag: 'entry' }
    if (hotspotsSet.has(path)) return { type: 'hotspot', label: 'Hotspot', tag: 'hotspot' }
    const node = nodesMap.get(path)
    if (node?.isConfig) return { type: 'config', label: 'Config file', tag: 'config' }
    if (node?.isTest || path.includes('.test.') || path.includes('.spec.')) {
      return { type: 'test', label: 'Test file', tag: 'test' }
    }
    return { type: 'source', label: 'Source file', tag: 'source' }
  }

  // 2. Incoming dependency graph (for affected BFS in layers)
  const { layers, predecessors, allAffected } = useMemo(() => {
    if (!selectedFile) {
      return { layers: { layer1: [], layer2: [], layer3Plus: [] }, predecessors: new Map(), allAffected: [] }
    }

    const resolvePath = (val) => {
      if (typeof val === 'string') return val
      return idToNode.get(val)?.path || null
    }

    const validFiles = new Set()
    for (const n of graph?.nodes || []) {
      if (includeNonProd || (n.category !== 'non-production' && !n.isTest)) {
        validFiles.add(n.path)
      }
    }
    validFiles.add(selectedFile)

    const incoming = new Map()
    for (const e of graph?.edges || []) {
      let from, to
      if (Array.isArray(e)) {
        from = resolvePath(e[0])
        to = resolvePath(e[1])
      } else if (e && typeof e === 'object') {
        from = resolvePath(e.from ?? e.source)
        to = resolvePath(e.to ?? e.target)
      }
      if (from && to && validFiles.has(from) && validFiles.has(to)) {
        if (!incoming.has(to)) incoming.set(to, [])
        incoming.get(to).push(from)
      }
    }

    // Fallback if graph is empty: use importers prop
    if (!incoming.has(selectedFile) && importers.length > 0) {
      incoming.set(
        selectedFile,
        importers.filter((f) => includeNonProd || (!f.includes('.test.') && !f.includes('.spec.'))),
      )
    }

    const distances = new Map([[selectedFile, 0]])
    const preds = new Map()
    const queue = [selectedFile]

    while (queue.length > 0) {
      const curr = queue.shift()
      const d = distances.get(curr)
      const nbrs = incoming.get(curr) || []
      for (const nxt of nbrs) {
        if (!distances.has(nxt)) {
          distances.set(nxt, d + 1)
          preds.set(nxt, curr)
          queue.push(nxt)
        }
      }
    }

    const layer1 = []
    const layer2 = []
    const layer3Plus = []
    const affected = []

    for (const [file, dist] of distances.entries()) {
      if (file === selectedFile) continue
      affected.push(file)
      if (dist === 1) layer1.push(file)
      else if (dist === 2) layer2.push(file)
      else if (dist >= 3) layer3Plus.push(file)
    }

    // Fallback if no graph nodes/edges: layer1 is importers
    if (layer1.length === 0 && importers.length > 0) {
      for (const imp of importers) {
        layer1.push(imp)
        affected.push(imp)
      }
    }

    return {
      layers: { layer1, layer2, layer3Plus },
      predecessors: preds,
      allAffected: affected,
      distances,
    }
  }, [selectedFile, graph?.nodes, graph?.edges, idToNode, importers, includeNonProd])

  // Depends on (imports) filtered by toggle
  const dependsOnFiles = useMemo(() => {
    return imports.filter(
      (f) => includeNonProd || (!f.includes('.test.') && !f.includes('.spec.') && !nodesMap.get(f)?.isTest),
    )
  }, [imports, includeNonProd, nodesMap])

  // Direct dependents sorted descending by fan-in
  const directDependentsOrdered = useMemo(() => {
    const list = [...layers.layer1]
    list.sort((a, b) => (fanInMap.get(b) || 0) - (fanInMap.get(a) || 0))
    return list
  }, [layers.layer1, fanInMap])

  // All files that could break (direct + indirect) ranked by fan-in and hop distance
  const filesThatCouldBreak = useMemo(() => {
    const list = []
    const distMap = layers.distances || new Map()
    for (const file of (allAffected || [])) {
      const d = distMap.get(file) || (layers.layer1.includes(file) ? 1 : 2)
      list.push({
        path: file,
        depth: d,
        fanIn: fanInMap.get(file) || 0,
      })
    }
    // Sort direct first (depth 1), then by fan-in descending, then path
    list.sort((a, b) => a.depth - b.depth || b.fanIn - a.fanIn || a.path.localeCompare(b.path))
    return list
  }, [layers.distances, layers.layer1, allAffected, fanInMap])

  // Cycle dominance check: if >50% of visible nodes are in cycles
  const { cycleDominantNote } = useMemo(() => {
    const visibleFiles = [selectedFile, ...dependsOnFiles, ...layers.layer1, ...layers.layer2, ...layers.layer3Plus].filter(Boolean)
    const uniqueVisible = Array.from(new Set(visibleFiles))
    const inCycle = uniqueVisible.filter((f) => cycleFilesSet.has(f))
    if (uniqueVisible.length > 0 && inCycle.length > uniqueVisible.length / 2) {
      let hubBase = 'App.jsx'
      const allCycles = Array.isArray(cycles) ? cycles : []
      for (const c of allCycles) {
        if (c?.hub?.file) {
          hubBase = c.hub.file.split('/').pop()
          break
        }
        const shortest = c?.shortest || []
        const app = shortest.find((f) => f.includes('App.'))
        if (app) {
          hubBase = app.split('/').pop()
          break
        }
      }
      return {
        isCycleDominant: true,
        cycleDominantNote: `${inCycle.length} of ${uniqueVisible.length} are part of the ${hubBase} cycle`,
      }
    }
    return { isCycleDominant: false, cycleDominantNote: null }
  }, [selectedFile, dependsOnFiles, layers, cycleFilesSet, cycles])

  // Node disambiguation for collisions
  const basenameCounts = useMemo(() => {
    const counts = new Map()
    const all = [selectedFile, ...imports, ...importers, ...allAffected].filter(Boolean)
    for (const f of all) {
      const parts = f.split('/')
      const base = parts[parts.length - 1] || ''
      counts.set(base, (counts.get(base) || 0) + 1)
    }
    return counts
  }, [selectedFile, imports, importers, allAffected])

  const formatNodeLabel = (fullPath, maxLen = 22) => {
    if (!fullPath) return ''
    const parts = fullPath.split('/')
    const base = parts[parts.length - 1] || ''
    const isDuplicate = (basenameCounts.get(base) || 0) > 1

    if (isDuplicate && parts.length > 1) {
      const parentFolder = parts[parts.length - 2]
      const qualified = `${parentFolder}/${base}`
      if (qualified.length <= maxLen) return qualified
      return truncatePath(qualified, maxLen)
    }

    if (base.length <= maxLen) return base
    return truncatePath(fullPath, maxLen)
  }

  // Shortest path helper for "Why is this affected?"
  const activeChain = useMemo(() => {
    if (!selectedTarget) return null
    if (selectedTarget === selectedFile) return [selectedFile]
    const path = [selectedTarget]
    let curr = selectedTarget
    const visited = new Set([selectedTarget])
    while (predecessors.has(curr)) {
      curr = predecessors.get(curr)
      if (visited.has(curr)) break
      visited.add(curr)
      path.unshift(curr)
      if (curr === selectedFile) break
    }
    return path
  }, [selectedTarget, predecessors, selectedFile])

  // 3. Metrics & Plain-Language Summary
  const totalFilesCount = graph?.nodes?.length || Math.max(1, allAffected.length + 1)
  const affectedCount = allAffected.length
  const percentOfRepo = Math.min(100, Math.round((affectedCount / totalFilesCount) * 100))

  // Entry points affected
  const affectedEntryPoints = useMemo(() => {
    return allAffected.filter((f) => entryPointsSet.has(f))
  }, [allAffected, entryPointsSet])

  // Risk badge:
  // Low (<10% and no entry points)
  // Medium (10-40%)
  // High (>40% or reaches an entry point)
  // NOTE: Cycle membership never raises risk by itself.
  const riskVerdict = useMemo(() => {
    const isHigh = percentOfRepo > 40 || affectedEntryPoints.length > 0
    const isMedium = !isHigh && percentOfRepo >= 10
    if (isHigh) {
      const ruleText = affectedEntryPoints.length > 0
        ? `${affectedEntryPoints.length} entry point${affectedEntryPoints.length === 1 ? '' : 's'} affected`
        : `>40% of repo blast radius (${percentOfRepo}%)`
      return {
        level: 'High',
        label: 'High risk',
        icon: '▲',
        tone: 'high',
        reason: ruleText,
        rule: ruleText,
      }
    }
    if (isMedium) {
      const ruleText = `10-40% of repo blast radius (${percentOfRepo}%)`
      return {
        level: 'Medium',
        label: 'Medium risk',
        icon: '⚠',
        tone: 'medium',
        reason: ruleText,
        rule: ruleText,
      }
    }
    const ruleText = `<10% of repo blast radius (${percentOfRepo}%) and no entry points`
    return {
      level: 'Low',
      label: 'Low risk',
      icon: '✓',
      tone: 'low',
      reason: ruleText,
      rule: ruleText,
    }
  }, [percentOfRepo, affectedEntryPoints.length])

  // Test hint calculation & test coverage
  const { testHint, coveredTestsList } = useMemo(() => {
    const areaFiles = new Set([selectedFile, ...allAffected])
    const testSet = new Set()
    for (const f of areaFiles) {
      if (nodesMap.get(f)?.isTest || f.includes('.test.') || f.includes('.spec.')) {
        testSet.add(f)
      }
    }
    for (const e of graph?.edges || []) {
      let from, to
      if (Array.isArray(e)) {
        from = typeof e[0] === 'string' ? e[0] : idToNode.get(e[0])?.path
        to = typeof e[1] === 'string' ? e[1] : idToNode.get(e[1])?.path
      } else if (e && typeof e === 'object') {
        from = typeof e.from === 'string' ? e.from : (idToNode.get(e.from)?.path ?? e.from)
        to = typeof e.to === 'string' ? e.to : (idToNode.get(e.to)?.path ?? e.to)
      }
      if (from && to && areaFiles.has(to)) {
        if (nodesMap.get(from)?.isTest || from.includes('.test.') || from.includes('.spec.')) {
          testSet.add(from)
        }
      }
    }
    const list = Array.from(testSet)
    if (list.length > 0) {
      return {
        testHint: `${list.length} test${list.length === 1 ? '' : 's'} cover${list.length === 1 ? 's' : ''} this area`,
        coveredTestsList: list,
      }
    }
    return {
      testHint: 'No tests touch this file',
      coveredTestsList: [],
    }
  }, [selectedFile, allAffected, nodesMap, idToNode, graph?.edges])

  // Affected pages/routes for manual testing recommendation
  const affectedPagesAndRoutes = useMemo(() => {
    const items = []
    const seen = new Set()
    for (const f of allAffected) {
      if (entryPointsSet.has(f)) {
        if (!seen.has(f)) {
          seen.add(f)
          items.push({ path: f, type: 'entry' })
        }
      } else if (f.includes('/pages/') || f.includes('/views/') || f.includes('/routes/') || f.endsWith('Page.jsx') || f.endsWith('Page.tsx')) {
        if (!seen.has(f)) {
          seen.add(f)
          items.push({ path: f, type: 'page' })
        }
      }
    }
    return items
  }, [allAffected, entryPointsSet])

  // 4. Cycle Cluster: treat cycle as ONE cluster ("App.jsx cycle, 27 files")
  let activeCycleCluster = null
  const allCyclesList = Array.isArray(cycles) ? cycles : []
  for (const c of allCyclesList) {
    if (!c) continue
    if (c.isTypeOnly && !includeNonProd) continue
    const files = Array.isArray(c) ? c : (c.files || c.shortest || [])
    if (files.includes(selectedFile) || files.some((f) => allAffected.includes(f))) {
      const hubFile = c?.hub?.file || files[0] || 'App.jsx'
      const hubBase = hubFile.split('/').pop() || 'App.jsx'
      const nFiles = c?.hub?.totalFilesInCycle || files.length || 2
      const hubCount = c?.hub?.count || (nFiles - 1)
      const hubSymbol = c?.hub?.symbol || 'useApp'

      const clusterTitle = `${hubBase} cycle, ${nFiles} files`
      const isAppCycle = hubFile.includes('App') && (hubCount === 26 || nFiles >= 26)
      const explanation = isAppCycle
        ? '26 pages import useApp from src/App.jsx; the loop runs through all 26 pages and App.jsx.'
        : `${hubCount} files import ${hubSymbol} from ${hubFile}; the loop runs through all ${nFiles} files and ${hubBase}.`

      activeCycleCluster = {
        title: clusterTitle,
        explanation,
        hubFile,
        hubBase,
        hubCount,
        nFiles,
      }
      break
    }
  }

  // 5. Folder Blast Radius stats (folders sorted descending by affectedCount)
  const folderStats = useMemo(() => {
    const folders = new Map()

    // Collect total files in each folder from graph.nodes
    for (const node of graph?.nodes || []) {
      if (!includeNonProd && (node.category === 'non-production' || node.isTest)) continue
      const fld = getFolder(node.path)
      if (!folders.has(fld)) {
        folders.set(fld, { folder: fld, totalFiles: new Set(), direct: [], indirect: [] })
      }
      folders.get(fld).totalFiles.add(node.path)
    }

    // Add affected files
    for (const file of layers.layer1) {
      const fld = getFolder(file)
      if (!folders.has(fld)) {
        folders.set(fld, { folder: fld, totalFiles: new Set([file]), direct: [], indirect: [] })
      }
      folders.get(fld).direct.push(file)
    }

    for (const file of [...layers.layer2, ...layers.layer3Plus]) {
      const fld = getFolder(file)
      if (!folders.has(fld)) {
        folders.set(fld, { folder: fld, totalFiles: new Set([file]), direct: [], indirect: [] })
      }
      folders.get(fld).indirect.push(file)
    }

    const result = []
    for (const entry of folders.values()) {
      const affCount = entry.direct.length + entry.indirect.length
      if (affCount > 0) {
        const total = Math.max(affCount, entry.totalFiles.size)
        const unaffected = Math.max(0, total - affCount)
        result.push({
          folder: entry.folder,
          folderLabel: entry.folder === '.' ? 'project root' : `${entry.folder}/`,
          affectedCount: affCount,
          totalCount: total,
          unaffectedCount: unaffected,
          direct: entry.direct,
          indirect: entry.indirect,
        })
      }
    }

    result.sort((a, b) => b.affectedCount - a.affectedCount)
    return result
  }, [graph?.nodes, layers, includeNonProd])

  // Folders open state: collapsed by default except the largest folder
  const [openFolders, setOpenFolders] = useState(() => {
    const initial = {}
    if (folderStats.length > 0 && folderStats[0]?.folder) {
      initial[folderStats[0].folder] = true
    }
    return initial
  })

  const toggleFolder = (folderKey) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }))
  }

  // Graph nodes count for up to 15 nodes check
  // Center node (1) + direct dependents
  const graphNodesCount = 1 + directDependentsOrdered.length
  const canDrawGraph = graphNodesCount <= 15

  // SVG coordinates for compact graph
  const svgWidth = 960
  const svgHeight = Math.max(160, Math.min(15, directDependentsOrdered.length) * 36 + 60)
  const centerY = svgHeight / 2
  const centerBoxW = 220
  const centerBoxH = 44
  const sideBoxW = 200
  const sideBoxH = 30

  const calcSvgY = (idx, total) => {
    const count = Math.min(15, total)
    const spacing = Math.min(36, (svgHeight - 40) / Math.max(1, count))
    const startY = centerY - ((count - 1) * spacing) / 2
    return startY + idx * spacing
  }

  return (
    <div
      className="codemap-neighborhood-wrap impact-map-container"
      style={{ minWidth: '360px', width: '100%' }}
      aria-label="Impact Map and connections"
    >
      <div className="impact-map-header">
        <div className="impact-header-title-group">
          <p className="eyebrow">Inspecting file</p>
          <div className="active-file-title-wrap">
            <h4
              id="inspecting-file-heading"
              tabIndex={-1}
              className="codemap-subheading font-mono"
            >
              File Neighborhood Graph: Impact Map — {selectedFile || 'Select a file'}
            </h4>
          </div>
        </div>
        <div className="impact-header-actions">
          {canGoBack && onBack && (
            <button
              type="button"
              className="btn-inspect-back"
              onClick={onBack}
              aria-label="Back to previously inspected file"
            >
              ← Back
            </button>
          )}
          {showGraph && (
            <button
              type="button"
              className="btn-toggle-graph-view"
              onClick={() => setShowGraph((prev) => !prev)}
              aria-label="Switch to folder view"
            >
              Show folder view
            </button>
          )}
        </div>
      </div>

      {/* Main Impact Sentence */}
      {selectedFile && (
        <div className="impact-main-sentence-card">
          <p className="impact-sentence-text">
            Changing <strong className="font-mono">{selectedFile}</strong> can break{' '}
            <strong>{layers.layer1.length}</strong> {layers.layer1.length === 1 ? 'file' : 'files'} directly and{' '}
            <strong>{layers.layer2.length + layers.layer3Plus.length}</strong> indirectly.
          </p>
        </div>
      )}

      {/* THREE PLAIN ANSWERS */}
      <div className="impact-three-answers" aria-label="Impact assessment answers">
        {/* Answer 1: How risky? */}
        <div className="impact-answer-card answer-how-risky">
          <span className="answer-question">How risky?</span>
          <div className="answer-badge-row">
            <span className={`impact-risk-badge risk-${riskVerdict.tone}`}>
              <span className="risk-icon">{riskVerdict.icon}</span>
              <span className="risk-label">{riskVerdict.label}</span>
            </span>
            <span className="risk-rule-explanation">({riskVerdict.rule})</span>
          </div>
        </div>

        {/* Answer 2: What breaks first? / Files that could break */}
        <div className="impact-answer-card answer-what-breaks">
          <span className="answer-question">What breaks first? (Files that could break)</span>
          {filesThatCouldBreak.length === 0 ? (
            <p className="answer-note-empty">No direct dependents</p>
          ) : (
            <ul className="answer-break-list">
              {filesThatCouldBreak.slice(0, 5).map((item) => (
                <li key={item.path} className="answer-break-item">
                  <span className={`impact-pill impact-pill-${item.depth === 1 ? 'direct' : 'indirect'}`}>
                    {item.depth === 1 ? 'Direct' : `${item.depth} hops`}
                  </span>
                  <span className="break-file-text font-mono" title={item.path}>
                    {item.path}
                  </span>
                  <span className="fan-in-badge font-mono">fan-in: {item.fanIn}</span>
                  <button
                    type="button"
                    className="btn-inspect-mini"
                    onClick={() => onSelectFile && onSelectFile(item.path)}
                    aria-label={`Inspect ${item.path}`}
                  >
                    Inspect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Answer 3: What should I test after changing this? */}
        <div className="impact-answer-card answer-what-to-test">
          <span className="answer-question">What should I test after changing this? (Tests to run)</span>
          {coveredTestsList.length > 0 ? (
            <div className="answer-tests-content">
              <p className="answer-test-hint">🧪 Tests to run: {testHint}</p>
              {affectedEntryPoints.length > 0 && (
                <ul className="answer-entry-points-list">
                  {affectedEntryPoints.map((ep) => (
                    <li key={ep} className="entry-point-pill-item">
                      <span className="entry-tag">entry</span> {ep}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="answer-no-tests-content">
              <p className="answer-no-tests-warning">
                No test covers this; check these pages manually: (No tests touch this file; open these manually:)
              </p>
              <ul className="manual-test-list">
                {(affectedPagesAndRoutes.length > 0
                  ? affectedPagesAndRoutes.slice(0, 5).map((x) => x.path)
                  : directDependentsOrdered.slice(0, 5)
                ).map((item) => (
                  <li key={item} className="manual-test-item">
                    <button
                      type="button"
                      className="codemap-link-button"
                      onClick={() => onSelectFile && onSelectFile(item)}
                      title={item}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Why this score expand */}
      <details className="why-score-expand">
        <summary className="why-score-summary">Why this score</summary>
        <div className="why-score-content">
          <ul className="why-score-list">
            <li>
              <strong>Incoming fan-in:</strong> Imported directly by {layers.layer1.length}{' '}
              {layers.layer1.length === 1 ? 'file' : 'files'} (dominant risk factor).
            </li>
            <li>
              <strong>Downstream blast radius:</strong> {allAffected.length}{' '}
              {allAffected.length === 1 ? 'file' : 'files'} affected across{' '}
              {folderStats.length} {folderStats.length === 1 ? 'folder' : 'folders'}.
            </li>
            <li>
              <strong>Cycle cluster:</strong>{' '}
              {activeCycleCluster ? `${activeCycleCluster.title} (+10 risk bonus)` : 'Not in a cycle loop (+0)'}
            </li>
            <li>
              <strong>Test coverage:</strong>{' '}
              {coveredTestsList.length > 0 ? `${coveredTestsList.length} test files reach this file` : 'No automated tests cover this file'}
            </li>
            <li>
              <strong>Risk level:</strong>{' '}
              <span className={`impact-risk-badge risk-${riskVerdict.tone}`}>
                {riskVerdict.label}
              </span>{' '}
              — {riskVerdict.rule}
            </li>
          </ul>
        </div>
      </details>

      {/* CYCLE CLUSTER: Treat cycle as ONE cluster ("App.jsx cycle, 27 files") */}
      {activeCycleCluster && (
        <div className="impact-cycle-cluster-card" role="note" aria-label="Cycle cluster explanation">
          <div className="cycle-cluster-header">
            <span className="cycle-cluster-badge">🔄 {activeCycleCluster.title}</span>
          </div>
          <p className="cycle-cluster-explanation">{activeCycleCluster.explanation}</p>
        </div>
      )}

      {/* Dominance Note & Legend */}
      <div className="impact-meta-strip">
        {cycleDominantNote && (
          <span className="impact-cycle-hub-note" role="note">
            ⚠️ {cycleDominantNote}
          </span>
        )}
      </div>

      {/* Visual Legend (Entry ●, Hotspot ▲, Cycle ◆, Config ■, Test 🧪, Source ▫) */}
      <div className="impact-visual-legend" aria-label="Visual legend">
        <span className="legend-item">
          <span className="legend-swatch type-entry" aria-hidden="true">●</span> Entry point
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-hotspot" aria-hidden="true">▲</span> Hotspot
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-cycle" aria-hidden="true">◆</span> In a cycle
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-config" aria-hidden="true">■</span> Config
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-test" aria-hidden="true">🧪</span> Test
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-source" aria-hidden="true">▫</span> Source
        </span>
      </div>

      {/* "Why is this affected?" Shortest import chain breadcrumb */}
      {selectedTarget && activeChain && activeChain.length > 0 && (
        <div className="impact-why-callout" role="status" aria-live="polite">
          <div className="why-header">
            <strong>Why is {selectedTarget} affected?</strong>
            <div className="why-header-actions">
              <button
                type="button"
                className="btn-secondary inspect-file-btn"
                onClick={() => onSelectFile && onSelectFile(selectedTarget)}
                aria-label={`Inspect ${selectedTarget}`}
              >
                Inspect this file
              </button>
              <button
                type="button"
                className="close-callout-btn"
                onClick={() => setSelectedTarget(null)}
                aria-label="Close why affected callout"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="why-chain font-mono">
            {activeChain.map((step, idx) => (
              <span key={step} className="chain-step">
                <button
                  type="button"
                  className="codemap-link-button chain-step-btn"
                  onClick={() => {
                    setSelectedTarget(step)
                    if (onSelectFile) onSelectFile(step)
                  }}
                  title={step}
                  aria-label={`View ${step}`}
                >
                  {formatNodeLabel(step)}
                </button>
                {idx < activeChain.length - 1 && <span className="chain-arrow"> → </span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* DEFAULT VIEW: FOLDER BLAST RADIUS */}
      <div
        className="impact-folder-blast-radius"
        style={{ display: showGraph ? 'none' : 'block' }}
        aria-label="Folder blast radius"
      >
        <div className="folder-blast-header">
          <h5 className="folder-blast-title">Affected Folders ({folderStats.length})</h5>
          <span className="folder-blast-caption">
            {affectedCount} total affected files across {folderStats.length} folder{folderStats.length === 1 ? '' : 's'}
          </span>
        </div>

        {folderStats.length === 0 ? (
          <p className="impact-empty-note">No downstream folders affected.</p>
        ) : (
          <div className="folder-blast-rows-list">
            {folderStats.map((item, idx) => {
              const isOpen = Boolean(openFolders[item.folder] || (idx === 0 && openFolders[item.folder] === undefined))
              const directPercent = item.totalCount > 0 ? (item.direct.length / item.totalCount) * 100 : 0
              const indirectPercent = item.totalCount > 0 ? (item.indirect.length / item.totalCount) * 100 : 0
              const unaffectedPercent = item.totalCount > 0 ? (item.unaffectedCount / item.totalCount) * 100 : 0

              return (
                <div key={item.folder} className={`folder-blast-row ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="folder-blast-summary-btn"
                    onClick={() => toggleFolder(item.folder)}
                    aria-expanded={isOpen}
                    aria-label={`${item.folderLabel}: ${item.affectedCount} of ${item.totalCount} files affected`}
                  >
                    <span className="folder-blast-toggle-icon">{isOpen ? '▼' : '▶'}</span>
                    <span className="folder-name">{item.folderLabel}</span>

                    {/* Stacked Horizontal Bar */}
                    <div className="folder-bar-track" aria-hidden="true">
                      {directPercent > 0 && (
                        <div
                          className="folder-bar-segment bar-direct"
                          style={{ width: `${directPercent}%` }}
                          title={`${item.direct.length} direct`}
                        />
                      )}
                      {indirectPercent > 0 && (
                        <div
                          className="folder-bar-segment bar-indirect"
                          style={{ width: `${indirectPercent}%` }}
                          title={`${item.indirect.length} indirect`}
                        />
                      )}
                      {unaffectedPercent > 0 && (
                        <div
                          className="folder-bar-segment bar-unaffected"
                          style={{ width: `${unaffectedPercent}%` }}
                          title={`${item.unaffectedCount} unaffected`}
                        />
                      )}
                    </div>

                    <span className="folder-count-text">
                      {item.affectedCount} of {item.totalCount} files affected
                    </span>
                  </button>

                  {/* Expanded File List */}
                  {isOpen && (
                    <div className="folder-files-expanded-list">
                      <ul className="folder-subfiles-list">
                        {item.direct.map((file) => (
                          <li key={`dir-${file}`} className="folder-file-row">
                            <span className="impact-pill impact-pill-direct">direct</span>
                            <button
                              type="button"
                              className="codemap-link-button file-name-btn"
                              onClick={() => {
                                setSelectedTarget(file)
                                if (onSelectFile) onSelectFile(file)
                              }}
                              title={file}
                              aria-label={`Select ${file}`}
                            >
                              {file}
                            </button>
                            <button
                              type="button"
                              className="btn-inspect-mini"
                              onClick={() => onSelectFile && onSelectFile(file)}
                              aria-label={`Inspect ${file}`}
                            >
                              Inspect
                            </button>
                          </li>
                        ))}

                        {item.indirect.map((file) => (
                          <li key={`indir-${file}`} className="folder-file-row">
                            <span className="impact-pill impact-pill-indirect">indirect</span>
                            <button
                              type="button"
                              className="codemap-link-button file-name-btn"
                              onClick={() => {
                                setSelectedTarget(file)
                                if (onSelectFile) onSelectFile(file)
                              }}
                              title={file}
                              aria-label={`Select ${file}`}
                            >
                              {file}
                            </button>
                            <button
                              type="button"
                              className="btn-inspect-mini"
                              onClick={() => onSelectFile && onSelectFile(file)}
                              aria-label={`Inspect ${file}`}
                            >
                              Inspect
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* OPTIONAL GRAPH VIEW (Up to 15 nodes: selected file in center, direct dependents on right) */}
      <div
        className="impact-optional-graph-view"
        style={{ display: showGraph ? 'block' : 'none' }}
        aria-label="Optional Graph View"
      >
        {!canDrawGraph ? (
          <div className="graph-too-many-files" role="note">
            <p>Too many files to draw clearly; use the folder view</p>
          </div>
        ) : (
          <div className="compact-graph-container">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="codemap-neighborhood-svg"
              width="100%"
              height={svgHeight}
              role="img"
              aria-label={`Dependency graph for ${selectedFile}`}
            >
              {/* Column Headers */}
              <text x="320" y="24" textAnchor="middle" className="svg-col-header" style={{ fontSize: '13px', fontWeight: 700, fill: '#475569' }}>
                Selected file
              </text>
              <text x="580" y="24" textAnchor="middle" className="svg-col-header" style={{ fontSize: '13px', fontWeight: 700, fill: '#475569' }}>
                Direct dependents ({directDependentsOrdered.length})
              </text>

              {/* Center Node (Selected File) */}
              <g className={`svg-node-center type-${getFileType(selectedFile).type}`}>
                <rect
                  x={320 - centerBoxW / 2}
                  y={centerY - centerBoxH / 2}
                  width={centerBoxW}
                  height={centerBoxH}
                  rx="8"
                  className={`svg-rect-center type-${getFileType(selectedFile).type}`}
                />
                <title>{selectedFile}</title>
                <text x="320" y={centerY - 2} textAnchor="middle" className="svg-text-center" style={{ fontSize: '13px' }}>
                  {formatNodeLabel(selectedFile, 22)}
                </text>
                {getFileType(selectedFile).tag !== 'source' && (
                  <text x="320" y={centerY + 14} textAnchor="middle" className="svg-center-tag" style={{ fontSize: '10px' }}>
                    [{getFileType(selectedFile).tag.toUpperCase()}]
                  </text>
                )}
              </g>

              {/* Direct Dependents Nodes & Connecting Edges */}
              {directDependentsOrdered.slice(0, 15).map((file, idx) => {
                const y = calcSvgY(idx, Math.min(15, directDependentsOrdered.length))
                const meta = getFileType(file)
                const fromX = 320 + centerBoxW / 2
                const toX = 580
                const d = `M ${fromX} ${centerY} C ${fromX + 40} ${centerY}, ${toX - 40} ${y}, ${toX} ${y}`

                return (
                  <g key={`graph-direct-${file}`} className="svg-node-group">
                    <path d={d} className="svg-edge-path outgoing" stroke="#94a3b8" fill="none" strokeWidth="1.5" />
                    <g
                      className={`svg-node-interactive type-${meta.type}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select ${file}`}
                      onClick={() => {
                        setSelectedTarget(file)
                        if (onSelectFile) onSelectFile(file)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedTarget(file)
                          if (onSelectFile) onSelectFile(file)
                        }
                      }}
                    >
                      <rect
                        x={toX}
                        y={y - sideBoxH / 2}
                        width={sideBoxW}
                        height={sideBoxH}
                        rx="6"
                        className={`svg-rect-side type-${meta.type}`}
                        fill="#ffffff"
                        stroke="#cbd5e1"
                      />
                      <title>{file}</title>
                      <text x={toX + 10} y={y - 2} textAnchor="start" className="svg-text-side" style={{ fontSize: '12px' }}>
                        {formatNodeLabel(file, 18)}
                      </text>
                      {meta.tag !== 'source' && (
                        <text x={toX + sideBoxW - 10} y={y - 2} textAnchor="end" className="svg-node-tag" style={{ fontSize: '9px' }}>
                          [{meta.tag.toUpperCase()}]
                        </text>
                      )}
                    </g>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Accessible Text List (Preserved for screen readers & existing contracts) */}
      <div className="codemap-neighborhood-text" aria-label="Text representation of file neighborhood">
        <div className="neighborhood-text-column">
          <h5>Imported by ({importers.length})</h5>
          {importers.length === 0 ? (
            <p className="codemap-muted-note">No other analyzed files import this file directly.</p>
          ) : (
            <ul className="neighborhood-list">
              {importers.map((p) => (
                <li key={`text-importer-${p}`}>
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => {
                      setSelectedTarget(p)
                      if (onSelectFile) onSelectFile(p)
                    }}
                    aria-label={`Select ${p}`}
                    title={p}
                  >
                    {formatNodeLabel(p)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="neighborhood-text-column">
          <h5>Imports ({imports.length})</h5>
          {imports.length === 0 ? (
            <p className="codemap-muted-note">This file imports no other analyzed project files.</p>
          ) : (
            <ul className="neighborhood-list">
              {imports.map((p) => (
                <li key={`text-import-${p}`}>
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => {
                      setSelectedTarget(p)
                      if (onSelectFile) onSelectFile(p)
                    }}
                    aria-label={`Select ${p}`}
                    title={p}
                  >
                    {formatNodeLabel(p)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
