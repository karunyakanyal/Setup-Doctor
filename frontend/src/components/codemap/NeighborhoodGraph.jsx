import { useState, useMemo } from 'react'

const MAX_SVG_ITEMS = 10

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

export default function NeighborhoodGraph({
  selectedFile,
  imports = [],
  importers = [],
  graph = null,
  cycles = [],
  summary = null,
  includeNonProd = false,
  onSelectFile,
}) {
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [copied, setCopied] = useState(false)

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

  // Classify file type: source, test, config, entry point, hotspot, file in a cycle
  const getFileType = (path) => {
    if (!path) return { type: 'source', label: 'Source file', tag: 'source' }
    if (cycleFilesSet.has(path)) return { type: 'cycle', label: 'In a cycle', tag: 'cycle' }
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

    return {
      layers: { layer1, layer2, layer3Plus },
      predecessors: preds,
      allAffected: affected,
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
  const directCount = layers.layer1.length
  const indirectCount = layers.layer2.length + layers.layer3Plus.length

  // Most affected folder
  const mostAffectedArea = useMemo(() => {
    if (allAffected.length === 0) return null
    const folderCounts = {}
    for (const f of allAffected) {
      const parts = f.split('/')
      parts.pop()
      const folder = parts.length > 0 ? parts.join('/') : 'project root'
      folderCounts[folder] = (folderCounts[folder] || 0) + 1
    }
    let topFolder = 'project root'
    let topCount = 0
    for (const [folder, count] of Object.entries(folderCounts)) {
      if (count > topCount) {
        topCount = count
        topFolder = folder
      }
    }
    return { folder: topFolder, count: topCount }
  }, [allAffected])

  // Entry points affected
  const affectedEntryPoints = useMemo(() => {
    return allAffected.filter((f) => entryPointsSet.has(f))
  }, [allAffected, entryPointsSet])

  // Cycle check for selected file
  const isSelectedInCycle = cycleFilesSet.has(selectedFile)

  // Risk badge:
  // Low (<10% and no entry point and not in cycle)
  // Medium (10-40%)
  // High (>40%, reaches an entry point, or is in a cycle)
  const riskVerdict = useMemo(() => {
    if (percentOfRepo > 40 || affectedEntryPoints.length > 0 || isSelectedInCycle) {
      return {
        level: 'High',
        label: 'High risk',
        icon: '▲',
        tone: 'high',
        reason: isSelectedInCycle
          ? 'File is in a circular dependency'
          : affectedEntryPoints.length > 0
            ? `${affectedEntryPoints.length} entry point${affectedEntryPoints.length === 1 ? '' : 's'} affected`
            : `${percentOfRepo}% repo blast radius`,
      }
    }
    if (percentOfRepo >= 10) {
      return {
        level: 'Medium',
        label: 'Medium risk',
        icon: '⚠',
        tone: 'medium',
        reason: `${percentOfRepo}% repo blast radius`,
      }
    }
    return {
      level: 'Low',
      label: 'Low risk',
      icon: '✓',
      tone: 'low',
      reason: 'Low blast radius and no critical topology risks',
    }
  }, [percentOfRepo, affectedEntryPoints.length, isSelectedInCycle])

  // Test hint calculation:
  // "N tests cover this area" or "No tests touch this file"
  const testHint = useMemo(() => {
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
    if (testSet.size > 0) {
      return `${testSet.size} test${testSet.size === 1 ? '' : 's'} cover${testSet.size === 1 ? 's' : ''} this area`
    }
    return 'No tests touch this file'
  }, [selectedFile, allAffected, nodesMap, idToNode, graph?.edges])

  // Copy list handler
  const handleCopyList = () => {
    const text = directDependentsOrdered.join('\n')
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // SVG dimensions & coordinates
  const svgWidth = 960
  const maxRows = Math.max(
    dependsOnFiles.length,
    layers.layer1.length,
    layers.layer2.length,
    layers.layer3Plus.length,
    1,
  )
  const displayRows = Math.min(MAX_SVG_ITEMS, maxRows)
  const svgHeight = Math.max(220, displayRows * 36 + 70)
  const centerY = svgHeight / 2

  const leftBoxW = 160
  const centerBoxW = 190
  const centerBoxH = 44
  const sideBoxW = 160
  const sideBoxH = 28

  const calcSvgY = (idx, total) => {
    const count = Math.min(MAX_SVG_ITEMS, total)
    const spacing = Math.min(36, (svgHeight - 60) / Math.max(1, count))
    const startY = centerY - ((count - 1) * spacing) / 2
    return startY + idx * spacing
  }

  const selectedMeta = getFileType(selectedFile)

  // Render layer nodes in the responsive HTML grid (with >40 collapse into +N more in <folder>)
  const renderLayerNodes = (fileList, layerTitle) => {
    if (fileList.length === 0) {
      return <p className="impact-layer-empty">None</p>
    }

    const COLLAPSE_THRESHOLD = 40
    const shouldCollapse = fileList.length > COLLAPSE_THRESHOLD
    const visibleList = shouldCollapse ? fileList.slice(0, 35) : fileList
    const collapsedList = shouldCollapse ? fileList.slice(35) : []

    const collapsedByFolder = {}
    if (shouldCollapse) {
      for (const f of collapsedList) {
        const parts = f.split('/')
        parts.pop()
        const folder = parts.length > 0 ? parts.join('/') : 'project root'
        collapsedByFolder[folder] = (collapsedByFolder[folder] || 0) + 1
      }
    }

    return (
      <div className="impact-layer-column">
        <h6 className="impact-layer-title">
          {layerTitle} ({fileList.length})
        </h6>
        <div className="impact-node-grid">
          {visibleList.map((file) => {
            const meta = getFileType(file)
            const isHighlighted = activeChain && activeChain.includes(file)
            return (
              <button
                type="button"
                key={file}
                className={`impact-node-pill type-${meta.type} ${isHighlighted ? 'highlighted-chain' : ''}`}
                title={file}
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
                <span className="node-text">{formatNodeLabel(file)}</span>
                <span className="node-badge-tag">{meta.tag}</span>
              </button>
            )
          })}

          {shouldCollapse &&
            Object.entries(collapsedByFolder).map(([folder, cnt]) => (
              <div key={folder} className="impact-collapsed-pill">
                +{cnt} more in {folder}
              </div>
            ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="codemap-neighborhood-wrap impact-map-container"
      style={{ minWidth: '360px' }}
      aria-label="Impact Map and connections"
    >
      <div className="impact-map-header">
        <h4 className="codemap-subheading">File Neighborhood Graph: Impact Map</h4>
        <div className={`impact-risk-badge risk-${riskVerdict.tone}`} title={riskVerdict.reason}>
          <span className="risk-icon">{riskVerdict.icon}</span>
          <span className="risk-label">{riskVerdict.label}</span>
        </div>
      </div>

      {/* Plain-Language Summary */}
      <div className="impact-plain-summary">
        {affectedCount > 0 ? (
          <p>
            Changing <strong>{selectedFile}</strong> can affect <strong>{affectedCount}</strong> file
            {affectedCount === 1 ? '' : 's'} (<strong>{percentOfRepo}%</strong> of repository):{' '}
            <strong>{directCount}</strong> directly, <strong>{indirectCount}</strong> indirectly.{' '}
            {mostAffectedArea && (
              <>
                Most affected area: <strong>{mostAffectedArea.folder}</strong> ({mostAffectedArea.count} file
                {mostAffectedArea.count === 1 ? '' : 's'}).
              </>
            )}
          </p>
        ) : (
          <p>
            Changing <strong>{selectedFile}</strong> has no downstream impact (<strong>0%</strong> of repository).
          </p>
        )}
        <div className="impact-meta-strip">
          <span className="impact-test-hint">🧪 {testHint}</span>
          {affectedEntryPoints.length > 0 && (
            <span className="impact-entry-alert">
              🚀 {affectedEntryPoints.length} entry point{affectedEntryPoints.length === 1 ? '' : 's'} affected
            </span>
          )}
        </div>
      </div>

      {/* Visual Legend (text + color, never color alone) */}
      <div className="impact-visual-legend" aria-label="Visual legend">
        <span className="legend-item">
          <span className="legend-swatch type-entry"></span> Entry point
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-hotspot"></span> Hotspot
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-cycle"></span> In a cycle
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-config"></span> Config
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-test"></span> Test
        </span>
        <span className="legend-item">
          <span className="legend-swatch type-source"></span> Source
        </span>
      </div>

      {/* Interactive SVG Diagram */}
      <div
        className="codemap-svg-container"
        tabIndex={0}
        role="region"
        aria-label="Interactive dependency graph"
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="codemap-neighborhood-svg"
          width="100%"
          height={svgHeight}
          role="img"
          aria-label={`Impact map for ${selectedFile}`}
        >
          {/* Header labels */}
          <text x="110" y="22" textAnchor="middle" className="svg-col-header">
            Depends on ({dependsOnFiles.length})
          </text>
          <text x="320" y="22" textAnchor="middle" className="svg-col-header">
            Selected File
          </text>
          <text x="530" y="22" textAnchor="middle" className="svg-col-header">
            Layer 1: Direct ({layers.layer1.length})
          </text>
          <text x="720" y="22" textAnchor="middle" className="svg-col-header">
            Layer 2: Secondary ({layers.layer2.length})
          </text>
          <text x="880" y="22" textAnchor="middle" className="svg-col-header">
            Layer 3+: Transitive ({layers.layer3Plus.length})
          </text>

          {/* Left connections: Depends on -> Center */}
          {dependsOnFiles.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, dependsOnFiles.length)
            const fromX = 190
            const toX = 225
            const d = `M ${fromX} ${y} C ${fromX + 15} ${y}, ${toX - 15} ${centerY}, ${toX} ${centerY}`
            return <path key={`edge-dep-${file}`} d={d} className="svg-edge-path incoming" />
          })}

          {/* Center -> Layer 1 connections */}
          {layers.layer1.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, layers.layer1.length)
            const fromX = 415
            const toX = 450
            const d = `M ${fromX} ${centerY} C ${fromX + 15} ${centerY}, ${toX - 15} ${y}, ${toX} ${y}`
            return <path key={`edge-l1-${file}`} d={d} className="svg-edge-path outgoing" />
          })}

          {/* Left nodes (Depends On) */}
          {dependsOnFiles.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, dependsOnFiles.length)
            const meta = getFileType(file)
            return (
              <g
                key={`left-node-${file}`}
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
                  x="30"
                  y={y - sideBoxH / 2}
                  width={leftBoxW}
                  height={sideBoxH}
                  rx="6"
                  className={`svg-rect-side type-${meta.type}`}
                />
                <title>{file}</title>
                <text x="38" y={y + 4} textAnchor="start" className="svg-text-side">
                  {formatNodeLabel(file)}
                </text>
                <text x="182" y={y + 4} textAnchor="end" className="svg-node-tag">
                  {meta.tag}
                </text>
              </g>
            )
          })}
          {dependsOnFiles.length > MAX_SVG_ITEMS && (
            <text x="110" y={svgHeight - 8} textAnchor="middle" className="svg-text-extra">
              +{dependsOnFiles.length - MAX_SVG_ITEMS} more
            </text>
          )}

          {/* Center node */}
          <g className={`svg-node-center type-${selectedMeta.type}`}>
            <rect
              x={320 - centerBoxW / 2}
              y={centerY - centerBoxH / 2}
              width={centerBoxW}
              height={centerBoxH}
              rx="8"
              className={`svg-rect-center type-${selectedMeta.type}`}
            />
            <title>{selectedFile}</title>
            <text x="320" y={centerY - 2} textAnchor="middle" className="svg-text-center">
              {formatNodeLabel(selectedFile, 22)}
            </text>
            <text x="320" y={centerY + 14} textAnchor="middle" className="svg-center-tag">
              [{selectedMeta.tag}]
            </text>
          </g>

          {/* Layer 1 nodes */}
          {layers.layer1.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, layers.layer1.length)
            const meta = getFileType(file)
            return (
              <g
                key={`l1-node-${file}`}
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
                  x="450"
                  y={y - sideBoxH / 2}
                  width={sideBoxW}
                  height={sideBoxH}
                  rx="6"
                  className={`svg-rect-side type-${meta.type}`}
                />
                <title>{file}</title>
                <text x="458" y={y + 4} textAnchor="start" className="svg-text-side">
                  {formatNodeLabel(file)}
                </text>
                <text x="602" y={y + 4} textAnchor="end" className="svg-node-tag">
                  {meta.tag}
                </text>
              </g>
            )
          })}
          {layers.layer1.length > MAX_SVG_ITEMS && (
            <text x="530" y={svgHeight - 8} textAnchor="middle" className="svg-text-extra">
              +{layers.layer1.length - MAX_SVG_ITEMS} more
            </text>
          )}

          {/* Layer 2 nodes */}
          {layers.layer2.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, layers.layer2.length)
            const meta = getFileType(file)
            return (
              <g
                key={`l2-node-${file}`}
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
                  x="640"
                  y={y - sideBoxH / 2}
                  width={sideBoxW}
                  height={sideBoxH}
                  rx="6"
                  className={`svg-rect-side type-${meta.type}`}
                />
                <title>{file}</title>
                <text x="648" y={y + 4} textAnchor="start" className="svg-text-side">
                  {formatNodeLabel(file)}
                </text>
                <text x="792" y={y + 4} textAnchor="end" className="svg-node-tag">
                  {meta.tag}
                </text>
              </g>
            )
          })}
          {layers.layer2.length > MAX_SVG_ITEMS && (
            <text x="720" y={svgHeight - 8} textAnchor="middle" className="svg-text-extra">
              +{layers.layer2.length - MAX_SVG_ITEMS} more
            </text>
          )}

          {/* Layer 3+ nodes */}
          {layers.layer3Plus.slice(0, MAX_SVG_ITEMS).map((file, idx) => {
            const y = calcSvgY(idx, layers.layer3Plus.length)
            const meta = getFileType(file)
            return (
              <g
                key={`l3-node-${file}`}
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
                  x="820"
                  y={y - sideBoxH / 2}
                  width="130"
                  height={sideBoxH}
                  rx="6"
                  className={`svg-rect-side type-${meta.type}`}
                />
                <title>{file}</title>
                <text x="826" y={y + 4} textAnchor="start" className="svg-text-side">
                  {formatNodeLabel(file, 16)}
                </text>
                <text x="944" y={y + 4} textAnchor="end" className="svg-node-tag">
                  {meta.tag}
                </text>
              </g>
            )
          })}
          {layers.layer3Plus.length > MAX_SVG_ITEMS && (
            <text x="885" y={svgHeight - 8} textAnchor="middle" className="svg-text-extra">
              +{layers.layer3Plus.length - MAX_SVG_ITEMS} more
            </text>
          )}
        </svg>
      </div>

      {/* "Why is this affected?" Shortest import chain callout */}
      {selectedTarget && activeChain && activeChain.length > 0 && (
        <div className="impact-why-callout" role="status" aria-live="polite">
          <div className="why-header">
            <strong>Why is {selectedTarget} affected?</strong>
            <button
              type="button"
              className="close-callout-btn"
              onClick={() => setSelectedTarget(null)}
              aria-label="Close why affected callout"
            >
              ✕
            </button>
          </div>
          <div className="why-chain font-mono">
            {activeChain.map((step, idx) => (
              <span key={step} className="chain-step">
                <span className="step-file" title={step}>
                  {formatNodeLabel(step)}
                </span>
                {idx < activeChain.length - 1 && <span className="chain-arrow"> → </span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Responsive Layer Panels (Layers 1, 2, 3+) */}
      <div className="impact-layers-grid">
        {renderLayerNodes(layers.layer1, 'Layer 1: Direct dependents')}
        {renderLayerNodes(layers.layer2, 'Layer 2: Secondary dependents')}
        {renderLayerNodes(layers.layer3Plus, 'Layer 3+: Transitive dependents')}
      </div>

      {/* Action Sections: "Check these first" & "Entry points affected" */}
      <div className="impact-action-sections">
        <div className="action-card check-these-first">
          <div className="action-card-header">
            <h6>Check these first ({directDependentsOrdered.length})</h6>
            {directDependentsOrdered.length > 0 && (
              <button
                type="button"
                className="codemap-link-button copy-list-btn"
                onClick={handleCopyList}
              >
                {copied ? '✓ Copied!' : 'Copy list'}
              </button>
            )}
          </div>
          {directDependentsOrdered.length === 0 ? (
            <p className="impact-empty-note">No direct dependents to inspect.</p>
          ) : (
            <ul className="check-first-list">
              {directDependentsOrdered.slice(0, 5).map((f) => (
                <li key={f} className="check-first-item">
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => {
                      setSelectedTarget(f)
                      if (onSelectFile) onSelectFile(f)
                    }}
                    title={f}
                  >
                    {f}
                  </button>
                  <span className="fan-in-badge font-mono" title="Incoming importers count">
                    fan-in: {fanInMap.get(f) || 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="action-card entry-points-affected">
          <h6>Entry points affected ({affectedEntryPoints.length})</h6>
          {affectedEntryPoints.length === 0 ? (
            <p className="impact-empty-note">No entry points affected</p>
          ) : (
            <ul className="entry-points-list">
              {affectedEntryPoints.map((ep) => (
                <li key={ep} className="entry-point-item">
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => {
                      setSelectedTarget(ep)
                      if (onSelectFile) onSelectFile(ep)
                    }}
                    title={ep}
                  >
                    {ep}
                  </button>
                  <span className="file-tag entry-tag">entry</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
                  >
                    {p}
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
                  >
                    {p}
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
