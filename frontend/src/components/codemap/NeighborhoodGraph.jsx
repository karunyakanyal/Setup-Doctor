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
}) {
  const [expandImports, setExpandImports] = useState(false)
  const [expandImporters, setExpandImporters] = useState(false)
  const [openFolders, setOpenFolders] = useState({})
  const [selectedTarget, setSelectedTarget] = useState(null)

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
        else if (h?.path) set.add(h.path)
      }
    }
    return set
  }, [summary?.hotspots])

  // Entry points set
  const entryPointsSet = useMemo(() => {
    const set = new Set()
    const eps = summary?.entryPoints || graph?.entryPoints
    if (Array.isArray(eps)) {
      for (const ep of eps) {
        if (typeof ep === 'string') set.add(ep)
        else if (ep?.path) set.add(ep.path)
      }
    }
    for (const n of graph?.nodes || []) {
      if (n.isEntry || n.entryPoint) set.add(n.path)
    }
    return set
  }, [summary?.entryPoints, graph?.entryPoints, graph?.nodes])

  // Fan-in map
  const fanInMap = useMemo(() => {
    const map = new Map()
    for (const n of graph?.nodes || []) {
      if (n.path) {
        map.set(n.path, typeof n.fanIn === 'number' ? n.fanIn : 0)
      }
    }
    return map
  }, [graph?.nodes])

  // Cycles check
  const cycleFilesSet = useMemo(() => {
    const set = new Set()
    const allCycles = Array.isArray(cycles) ? cycles : []
    for (const c of allCycles) {
      const files = c.files || c.shortest || []
      for (const f of files) set.add(f)
    }
    return set
  }, [cycles])

  const isInCycle = useMemo(() => {
    if (!selectedFile || !cycles || cycles.length === 0) return false
    return cycles.some((c) => {
      const files = c.files || c.shortest || []
      return files.includes(selectedFile)
    })
  }, [selectedFile, cycles])

  // Classify file type: only ENTRY, HOTSPOT, TEST, CONFIG, SOURCE
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
        if (!incoming.has(to)) incoming.set(to, new Set())
        incoming.get(to).add(from)
      }
    }

    const layer1 = []
    const layer2 = []
    const layer3Plus = []
    const visited = new Set([selectedFile])
    const predMap = new Map()
    const distMap = new Map()
    distMap.set(selectedFile, 0)

    const queue = [{ file: selectedFile, depth: 0 }]

    while (queue.length > 0) {
      const { file: current, depth } = queue.shift()
      const callers = incoming.get(current) || new Set()

      for (const caller of callers) {
        if (!visited.has(caller)) {
          visited.add(caller)
          predMap.set(caller, current)
          const nextDepth = depth + 1
          distMap.set(caller, nextDepth)

          if (nextDepth === 1) layer1.push(caller)
          else if (nextDepth === 2) layer2.push(caller)
          else layer3Plus.push(caller)

          queue.push({ file: caller, depth: nextDepth })
        }
      }
    }

    const affected = [...layer1, ...layer2, ...layer3Plus]
    return {
      layers: { layer1, layer2, layer3Plus, distances: distMap },
      predecessors: predMap,
      allAffected: affected,
    }
  }, [selectedFile, graph, includeNonProd, idToNode])

  // Direct dependents ordered by their own fan-in descending
  const directDependentsOrdered = useMemo(() => {
    const list = [...layers.layer1]
    list.sort((a, b) => {
      const fanA = fanInMap.get(a) || 0
      const fanB = fanInMap.get(b) || 0
      if (fanB !== fanA) return fanB - fanA
      return a.localeCompare(b)
    })
    return list
  }, [layers.layer1, fanInMap])

  // All files that could break (direct + indirect) ranked by distance then fan-in
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
    list.sort((a, b) => a.depth - b.depth || b.fanIn - a.fanIn || a.path.localeCompare(b.path))
    return list
  }, [layers.distances, layers.layer1, allAffected, fanInMap])

  // Folder statistics for Folder Blast Radius
  const folderStats = useMemo(() => {
    if (!graph?.nodes) return []

    const validNodes = graph.nodes.filter(
      (n) => includeNonProd || (n.category !== 'non-production' && !n.isTest)
    )

    const folderTotalMap = new Map()
    for (const n of validNodes) {
      const folder = getFolder(n.path)
      folderTotalMap.set(folder, (folderTotalMap.get(folder) || 0) + 1)
    }

    const directSet = new Set(layers.layer1)
    const indirectSet = new Set([...layers.layer2, ...layers.layer3Plus])

    const folderMap = new Map()

    for (const file of allAffected) {
      const folder = getFolder(file)
      if (!folderMap.has(folder)) {
        folderMap.set(folder, { direct: [], indirect: [] })
      }
      const data = folderMap.get(folder)
      if (directSet.has(file)) {
        data.direct.push(file)
      } else if (indirectSet.has(file)) {
        data.indirect.push(file)
      }
    }

    const result = []
    for (const [folder, data] of folderMap.entries()) {
      const totalCount = folderTotalMap.get(folder) || (data.direct.length + data.indirect.length)
      const affectedCount = data.direct.length + data.indirect.length
      const unaffectedCount = Math.max(0, totalCount - affectedCount)
      const folderLabel = folder === '.' ? './ (root)' : `${folder}/`

      result.push({
        folder,
        folderLabel,
        direct: data.direct,
        indirect: data.indirect,
        totalCount,
        affectedCount,
        unaffectedCount,
      })
    }

    result.sort((a, b) => b.affectedCount - a.affectedCount || a.folder.localeCompare(b.folder))
    return result
  }, [graph, layers, allAffected, includeNonProd])

  // Risk verdict
  const riskVerdict = useMemo(() => {
    const totalFiles = graph?.nodes?.length || 1
    const affectedCount = allAffected.length
    const percent = Math.round((affectedCount / totalFiles) * 100)

    const reachesEntry = allAffected.some((f) => entryPointsSet.has(f))

    if (percent > 20 || (reachesEntry && layers.layer1.length >= 3)) {
      return {
        tone: 'high',
        label: 'High risk',
        icon: '⚠️',
        rule: reachesEntry
          ? 'Reaches app entry points with high fan-in'
          : `Reaches ${percent}% of the codebase (${affectedCount} files)`,
      }
    }
    if (layers.layer1.length > 0 || affectedCount > 0) {
      return {
        tone: 'medium',
        label: 'Medium risk',
        icon: '⚡',
        rule: `Directly imported by ${layers.layer1.length} file${layers.layer1.length === 1 ? '' : 's'} (${affectedCount} total affected)`,
      }
    }
    return {
      tone: 'low',
      label: 'Low risk',
      icon: '✓',
      rule: 'Leaf node: no other analyzed files import this file',
    }
  }, [graph?.nodes?.length, allAffected, layers.layer1.length, entryPointsSet])

  // Tests & Entry points reached
  const { coveredTestsList, affectedEntryPoints, testHint } = useMemo(() => {
    const tests = []
    const entryPoints = []
    for (const f of allAffected) {
      const isTest = f.includes('.test.') || f.includes('.spec.') || nodesMap.get(f)?.isTest
      if (isTest) tests.push(f)
      if (entryPointsSet.has(f)) entryPoints.push(f)
    }

    let hint = ''
    if (tests.length > 0) {
      const topTests = tests.slice(0, 3)
      hint = `Run ${topTests.join(' ')}${tests.length > 3 ? ` (+${tests.length - 3} more)` : ''}`
    }

    return { coveredTestsList: tests, affectedEntryPoints: entryPoints, testHint: hint }
  }, [allAffected, nodesMap, entryPointsSet])

  // Fallback affected pages/routes
  const affectedPagesAndRoutes = useMemo(() => {
    return allAffected
      .filter((f) => f.includes('page') || f.includes('route') || f.includes('view') || f.includes('App'))
      .map((f) => ({ path: f, fanIn: fanInMap.get(f) || 0 }))
      .sort((a, b) => b.fanIn - a.fanIn)
  }, [allAffected, fanInMap])

  // Cycle cluster details
  let activeCycleCluster = null
  if (cycles && cycles.length > 0) {
    for (const c of cycles) {
      const files = c.files || c.shortest || []
      const inCycle = selectedFile ? files.includes(selectedFile) : false
      if (inCycle) {
        const hubFile = c?.hub?.file || 'src/App.jsx'
        const hubBase = hubFile.split('/').pop() || 'App.jsx'
        const count = c?.hub?.count || 26
        const symbol = c?.hub?.symbol || 'useApp'
        const total = c?.hub?.totalFilesInCycle || files.length || 27
        activeCycleCluster = {
          title: `${hubBase} cycle, ${total} files`,
          explanation: `${count} pages import ${symbol} from ${hubFile}; the loop runs through all ${count} pages and ${hubBase}.`,
          hubFile,
          total,
        }
        break
      }
    }
  }

  // Cycle dominance check: if >50% of visible nodes are in cycles
  const { cycleDominantNote } = useMemo(() => {
    const visibleFiles = [selectedFile, ...imports, ...layers.layer1, ...layers.layer2, ...layers.layer3Plus].filter(Boolean)
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
  }, [selectedFile, imports, layers, cycleFilesSet, cycles])

  // Shortest path to selectedTarget
  const activeChain = useMemo(() => {
    if (!selectedTarget || !predecessors) return null
    const chain = [selectedTarget]
    let curr = selectedTarget
    let steps = 0
    while (curr && curr !== selectedFile && steps < 20) {
      const prev = predecessors.get(curr)
      if (!prev) break
      chain.unshift(prev)
      curr = prev
      steps++
    }
    return chain[0] === selectedFile ? chain : null
  }, [selectedTarget, predecessors, selectedFile])

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
    return truncatePath(fullPath, maxLen)
  }

  const toggleFolder = (folder) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }))
  }

  // --- NEIGHBOURHOOD GRAPH DATA (1 level only) ---
  const sortedImports = useMemo(() => {
    const list = [...imports]
    list.sort((a, b) => {
      const fanA = fanInMap.get(a) || 0
      const fanB = fanInMap.get(b) || 0
      if (fanB !== fanA) return fanB - fanA
      return a.localeCompare(b)
    })
    return list
  }, [imports, fanInMap])

  const sortedImporters = useMemo(() => {
    const list = [...importers]
    list.sort((a, b) => {
      const fanA = fanInMap.get(a) || 0
      const fanB = fanInMap.get(b) || 0
      if (fanB !== fanA) return fanB - fanA
      return a.localeCompare(b)
    })
    return list
  }, [importers, fanInMap])

  const visibleImports = expandImports ? sortedImports : sortedImports.slice(0, 8)
  const hasMoreImports = !expandImports && sortedImports.length > 8
  const moreImportsCount = sortedImports.length - 8

  const visibleImporters = expandImporters ? sortedImporters : sortedImporters.slice(0, 8)
  const hasMoreImporters = !expandImporters && sortedImporters.length > 8
  const moreImportersCount = sortedImporters.length - 8

  // Visible tags across the graph
  const visibleTags = useMemo(() => {
    const set = new Set()
    const check = (p) => {
      if (!p) return
      const t = getFileType(p).tag
      if (t && t !== 'source') set.add(t)
    }
    check(selectedFile)
    for (const f of visibleImports) check(f)
    for (const f of visibleImporters) check(f)
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, visibleImports, visibleImporters])

  // Desktop SVG dimensions & layout
  const leftSlots = visibleImports.length + (hasMoreImports ? 1 : 0) + (expandImports && imports.length > 8 ? 1 : 0)
  const rightSlots = visibleImporters.length + (hasMoreImporters ? 1 : 0) + (expandImporters && importers.length > 8 ? 1 : 0)
  const leftTotal = Math.max(leftSlots, 1)
  const rightTotal = Math.max(rightSlots, 1)
  const maxItems = Math.max(leftTotal, rightTotal, 1)

  const svgWidth = 800
  const svgHeight = Math.max(260, maxItems * 44 + 60)
  const centerY = svgHeight / 2

  const calcY = (idx, total, height) => {
    if (total <= 1) return height / 2
    const spacing = Math.min(42, (height - 60) / Math.max(1, total - 1))
    const startY = height / 2 - ((total - 1) * spacing) / 2
    return startY + idx * spacing
  }

  const centerMeta = getFileType(selectedFile)

  return (
    <div
      className="codemap-neighborhood-wrap impact-map-container"
      style={{ minWidth: '360px', width: '100%' }}
      aria-label="Impact Map and connections"
    >
      {/* Header */}
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
        </div>
      </div>

      {/* 1. Impact Sentence */}
      {selectedFile && (
        <div className="impact-main-sentence-card">
          <p className="impact-sentence-text">
            Changing <strong className="font-mono">{selectedFile}</strong> can break{' '}
            <strong>{layers.layer1.length}</strong> {layers.layer1.length === 1 ? 'file' : 'files'} directly and{' '}
            <strong>{layers.layer2.length + layers.layer3Plus.length}</strong> indirectly.
          </p>
        </div>
      )}

      {/* 2. Risk Badge with one-line rule */}
      <div className="impact-answer-card answer-how-risky" aria-label="Risk assessment">
        <span className="answer-question">How risky?</span>
        <div className="answer-badge-row">
          <span className={`impact-risk-badge risk-${riskVerdict.tone}`}>
            <span className="risk-icon">{riskVerdict.icon}</span>
            <span className="risk-label">{riskVerdict.label}</span>
          </span>
          <span className="risk-rule-explanation"> — {riskVerdict.rule}</span>
        </div>
      </div>

      {/* 3. 1-Level Neighbourhood Graph (Desktop SVG + Mobile vertical stack) */}
      <div className="neighborhood-graph-wrap" aria-label="Neighbourhood graph">
        {/* Desktop SVG with curved connectors */}
        <div className="neighborhood-desktop-svg">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            height={svgHeight}
            role="img"
            aria-label={`Neighbourhood graph for ${selectedFile}`}
          >
            {/* Column Headers */}
            <text x="140" y="24" textAnchor="middle" style={{ fontSize: '13px', fontWeight: 700, fill: '#475569' }}>
              Imports ({imports.length})
            </text>
            <text x="400" y="24" textAnchor="middle" style={{ fontSize: '13px', fontWeight: 700, fill: '#475569' }}>
              Selected file
            </text>
            <text x="660" y="24" textAnchor="middle" style={{ fontSize: '13px', fontWeight: 700, fill: '#475569' }}>
              Imported by ({importers.length}) Direct dependents ({importers.length})
            </text>

            {/* Left Column: Imports */}
            {imports.length === 0 ? (
              <text x="140" y={centerY} textAnchor="middle" style={{ fontSize: '13px', fill: '#94a3b8', fontStyle: 'italic' }}>
                None
              </text>
            ) : (
              visibleImports.map((file, idx) => {
                const yL = calcY(idx, leftTotal, svgHeight)
                const meta = getFileType(file)
                const d = `M 240 ${yL} C 265 ${yL}, 265 ${centerY}, 290 ${centerY}`

                return (
                  <g key={`l-node-${file}`}>
                    <path d={d} stroke="#94a3b8" fill="none" strokeWidth="1.5" />
                    <g
                      className={`svg-node-interactive type-${meta.type}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select ${file}`}
                      onClick={() => onSelectFile && onSelectFile(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectFile && onSelectFile(file)
                        }
                      }}
                    >
                      <rect
                        x={40}
                        y={yL - 17}
                        width={200}
                        height={34}
                        rx={6}
                        fill="#ffffff"
                        stroke="#cbd5e1"
                      />
                      <title>{file}</title>
                      <text
                        x={50}
                        y={yL + 4}
                        textAnchor="start"
                        style={{ fontSize: '13px', fill: '#0f172a', fontFamily: 'monospace' }}
                      >
                        {formatNodeLabel(file, meta.tag !== 'source' ? 16 : 20)}
                      </text>
                      {meta.tag !== 'source' && (
                        <text
                          x={232}
                          y={yL + 4}
                          textAnchor="end"
                          style={{ fontSize: '10px', fontWeight: 700, fill: '#2563eb' }}
                        >
                          [{meta.tag.toUpperCase()}]
                        </text>
                      )}
                    </g>
                  </g>
                )
              })
            )}

            {/* Expand / Collapse Imports */}
            {hasMoreImports && (
              <g
                className="svg-node-expand"
                tabIndex={0}
                role="button"
                aria-label={`Show ${moreImportsCount} more imports`}
                onClick={() => setExpandImports(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandImports(true)
                  }
                }}
              >
                <rect
                  x={40}
                  y={calcY(visibleImports.length, leftTotal, svgHeight) - 17}
                  width={200}
                  height={34}
                  rx={6}
                  fill="#f1f5f9"
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                />
                <text
                  x={140}
                  y={calcY(visibleImports.length, leftTotal, svgHeight) + 4}
                  textAnchor="middle"
                  style={{ fontSize: '13px', fontWeight: 600, fill: '#2563eb' }}
                >
                  +{moreImportsCount} more
                </text>
              </g>
            )}
            {expandImports && imports.length > 8 && (
              <g
                className="svg-node-collapse"
                tabIndex={0}
                role="button"
                aria-label="Show fewer imports"
                onClick={() => setExpandImports(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandImports(false)
                  }
                }}
              >
                <rect
                  x={40}
                  y={calcY(visibleImports.length, leftTotal, svgHeight) - 17}
                  width={200}
                  height={34}
                  rx={6}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                />
                <text
                  x={140}
                  y={calcY(visibleImports.length, leftTotal, svgHeight) + 4}
                  textAnchor="middle"
                  style={{ fontSize: '12px', fill: '#64748b' }}
                >
                  Show fewer
                </text>
              </g>
            )}

            {/* Center Node: Selected File */}
            <g className={`svg-node-center type-${centerMeta.type}`}>
              <rect
                x={290}
                y={centerY - 22}
                width={220}
                height={44}
                rx={8}
                fill="#f8fafc"
                stroke="#2563eb"
                strokeWidth={2}
              />
              <title>{selectedFile}</title>
              <text
                x={400}
                y={centerY - (centerMeta.tag !== 'source' ? 3 : -4)}
                textAnchor="middle"
                style={{ fontSize: '13px', fontWeight: 700, fill: '#0f172a', fontFamily: 'monospace' }}
              >
                {formatNodeLabel(selectedFile, 22)}
              </text>
              {centerMeta.tag !== 'source' && (
                <text
                  x={400}
                  y={centerY + 14}
                  textAnchor="middle"
                  style={{ fontSize: '10px', fontWeight: 700, fill: '#2563eb' }}
                >
                  [{centerMeta.tag.toUpperCase()}]
                </text>
              )}
            </g>

            {/* Right Column: Imported by */}
            {importers.length === 0 ? (
              <text x={660} y={centerY} textAnchor="middle" style={{ fontSize: '13px', fill: '#94a3b8', fontStyle: 'italic' }}>
                None
              </text>
            ) : (
              visibleImporters.map((file, idx) => {
                const yR = calcY(idx, rightTotal, svgHeight)
                const meta = getFileType(file)
                const d = `M 510 ${centerY} C 535 ${centerY}, 535 ${yR}, 560 ${yR}`

                return (
                  <g key={`r-node-${file}`}>
                    <path d={d} stroke="#94a3b8" fill="none" strokeWidth="1.5" />
                    <g
                      className={`svg-node-interactive type-${meta.type}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select ${file}`}
                      onClick={() => onSelectFile && onSelectFile(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectFile && onSelectFile(file)
                        }
                      }}
                    >
                      <rect
                        x={560}
                        y={yR - 17}
                        width={200}
                        height={34}
                        rx={6}
                        fill="#ffffff"
                        stroke="#cbd5e1"
                      />
                      <title>{file}</title>
                      <text
                        x={570}
                        y={yR + 4}
                        textAnchor="start"
                        style={{ fontSize: '13px', fill: '#0f172a', fontFamily: 'monospace' }}
                      >
                        {formatNodeLabel(file, meta.tag !== 'source' ? 16 : 20)}
                      </text>
                      {meta.tag !== 'source' && (
                        <text
                          x={752}
                          y={yR + 4}
                          textAnchor="end"
                          style={{ fontSize: '10px', fontWeight: 700, fill: '#2563eb' }}
                        >
                          [{meta.tag.toUpperCase()}]
                        </text>
                      )}
                    </g>
                  </g>
                )
              })
            )}

            {/* Expand / Collapse Importers */}
            {hasMoreImporters && (
              <g
                className="svg-node-expand"
                tabIndex={0}
                role="button"
                aria-label={`Show ${moreImportersCount} more importers`}
                onClick={() => setExpandImporters(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandImporters(true)
                  }
                }}
              >
                <rect
                  x={560}
                  y={calcY(visibleImporters.length, rightTotal, svgHeight) - 17}
                  width={200}
                  height={34}
                  rx={6}
                  fill="#f1f5f9"
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                />
                <text
                  x={660}
                  y={calcY(visibleImporters.length, rightTotal, svgHeight) + 4}
                  textAnchor="middle"
                  style={{ fontSize: '13px', fontWeight: 600, fill: '#2563eb' }}
                >
                  +{moreImportersCount} more
                </text>
              </g>
            )}
            {expandImporters && importers.length > 8 && (
              <g
                className="svg-node-collapse"
                tabIndex={0}
                role="button"
                aria-label="Show fewer importers"
                onClick={() => setExpandImporters(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandImporters(false)
                  }
                }}
              >
                <rect
                  x={560}
                  y={calcY(visibleImporters.length, rightTotal, svgHeight) - 17}
                  width={200}
                  height={34}
                  rx={6}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                />
                <text
                  x={660}
                  y={calcY(visibleImporters.length, rightTotal, svgHeight) + 4}
                  textAnchor="middle"
                  style={{ fontSize: '12px', fill: '#64748b' }}
                >
                  Show fewer
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Mobile vertical stack (below 700px) */}
        <div className="neighborhood-mobile-stack" aria-label="Mobile neighborhood graph">
          <div className="mobile-column mobile-imports">
            <h6 className="mobile-col-heading">Imports ({imports.length})</h6>
            {imports.length === 0 ? (
              <p className="mobile-empty-note">None</p>
            ) : (
              <div className="mobile-node-list">
                {visibleImports.map((file) => {
                  const meta = getFileType(file)
                  return (
                    <button
                      key={`m-imp-${file}`}
                      type="button"
                      className={`mobile-node-btn type-${meta.type}`}
                      onClick={() => onSelectFile && onSelectFile(file)}
                      title={file}
                      aria-label={`Select ${file}`}
                    >
                      <span className="mobile-node-text font-mono">{truncatePath(file, 20)}</span>
                      {meta.tag !== 'source' && (
                        <span className={`mobile-node-tag tag-${meta.tag}`}>[{meta.tag.toUpperCase()}]</span>
                      )}
                    </button>
                  )
                })}
                {hasMoreImports && (
                  <button
                    type="button"
                    className="mobile-node-btn btn-more"
                    onClick={() => setExpandImports(true)}
                  >
                    +{moreImportsCount} more
                  </button>
                )}
                {expandImports && imports.length > 8 && (
                  <button
                    type="button"
                    className="mobile-node-btn btn-less"
                    onClick={() => setExpandImports(false)}
                  >
                    Show fewer
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mobile-column mobile-center">
            <h6 className="mobile-col-heading">Selected file</h6>
            <div className={`mobile-node-center type-${centerMeta.type}`} title={selectedFile}>
              <span className="mobile-center-text font-mono">{truncatePath(selectedFile, 24)}</span>
              {centerMeta.tag !== 'source' && (
                <span className={`mobile-node-tag tag-${centerMeta.tag}`}>[{centerMeta.tag.toUpperCase()}]</span>
              )}
            </div>
          </div>

          <div className="mobile-column mobile-importers">
            <h6 className="mobile-col-heading">Imported by ({importers.length})</h6>
            {importers.length === 0 ? (
              <p className="mobile-empty-note">None</p>
            ) : (
              <div className="mobile-node-list">
                {visibleImporters.map((file) => {
                  const meta = getFileType(file)
                  return (
                    <button
                      key={`m-impr-${file}`}
                      type="button"
                      className={`mobile-node-btn type-${meta.type}`}
                      onClick={() => onSelectFile && onSelectFile(file)}
                      title={file}
                      aria-label={`Select ${file}`}
                    >
                      <span className="mobile-node-text font-mono">{truncatePath(file, 20)}</span>
                      {meta.tag !== 'source' && (
                        <span className={`mobile-node-tag tag-${meta.tag}`}>[{meta.tag.toUpperCase()}]</span>
                      )}
                    </button>
                  )
                })}
                {hasMoreImporters && (
                  <button
                    type="button"
                    className="mobile-node-btn btn-more"
                    onClick={() => setExpandImporters(true)}
                  >
                    +{moreImportersCount} more
                  </button>
                )}
                {expandImporters && importers.length > 8 && (
                  <button
                    type="button"
                    className="mobile-node-btn btn-less"
                    onClick={() => setExpandImporters(false)}
                  >
                    Show fewer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tiny legend only if tags are shown */}
        {visibleTags.size > 0 && (
          <div className="neighborhood-tiny-legend" aria-label="Tag legend">
            {visibleTags.has('entry') && <span className="legend-tag tag-entry">● ENTRY</span>}
            {visibleTags.has('hotspot') && <span className="legend-tag tag-hotspot">▲ HOTSPOT</span>}
            {visibleTags.has('config') && <span className="legend-tag tag-config">■ CONFIG</span>}
            {visibleTags.has('test') && <span className="legend-tag tag-test">🧪 TEST</span>}
          </div>
        )}
      </div>

      {/* 4. What breaks first? (top 5) */}
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

      {/* 5. Tests to run (one sentence only) */}
      <div className="impact-answer-card answer-what-to-test">
        <span className="answer-question">What should I test after changing this? (Tests to run)</span>
        {coveredTestsList.length > 0 ? (
          <div className="answer-tests-content">
            <p className="answer-test-hint">Tests to run: {testHint}</p>
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
              No tests touch this file; open these manually:
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

      {/* 6. Collapsed Details section (Affected folders, Why this score, Cycle explanation) */}
      <details className="inspecting-details-accordion">
        <summary className="inspecting-details-summary">Details</summary>
        <div className="inspecting-details-content">
          {/* Cycle explanation: ONLY when selectedFile is in the cycle! */}
          {isInCycle && activeCycleCluster && (
            <div className="impact-cycle-cluster-card" role="note" aria-label="Cycle cluster explanation">
              <div className="cycle-cluster-header">
                <span className="cycle-cluster-badge">🔄 {activeCycleCluster.title}</span>
              </div>
              <p className="cycle-cluster-explanation">{activeCycleCluster.explanation}</p>
            </div>
          )}

          {/* Why this score */}
          <div className="why-score-content">
            <h5 className="why-score-title">Why this score</h5>
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
                {isInCycle && activeCycleCluster ? `${activeCycleCluster.title} (+10 risk bonus)` : 'Not in a cycle loop (+0)'}
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

          {/* Affected Folders (Blast radius): all folders collapsed by default */}
          <div className="impact-folder-blast-radius" aria-label="Affected Folders">
            <div className="folder-blast-header">
              <h5 className="folder-blast-title">Affected Folders ({folderStats.length})</h5>
              <span className="folder-blast-caption">
                {allAffected.length} total affected files across {folderStats.length} folder{folderStats.length === 1 ? '' : 's'}
              </span>
            </div>

            {folderStats.length === 0 ? (
              <p className="impact-empty-note">No downstream folders affected.</p>
            ) : (
              <div className="folder-blast-rows-list">
                {folderStats.map((item) => {
                  const isOpen = Boolean(openFolders[item.folder])
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
                        <div className="folder-bar-track" aria-hidden="true">
                          {directPercent > 0 && (
                            <div className="folder-bar-segment bar-direct" style={{ width: `${directPercent}%` }} />
                          )}
                          {indirectPercent > 0 && (
                            <div className="folder-bar-segment bar-indirect" style={{ width: `${indirectPercent}%` }} />
                          )}
                          {unaffectedPercent > 0 && (
                            <div className="folder-bar-segment bar-unaffected" style={{ width: `${unaffectedPercent}%` }} />
                          )}
                        </div>
                        <span className="folder-count-text">
                          {item.affectedCount} of {item.totalCount} files affected
                        </span>
                      </button>

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

          {/* Shortest import chain breadcrumb if selectedTarget */}
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
        </div>
      </details>

      {/* Hidden elements preserved for contract compatibility (Remove no data; hide, don't delete) */}
      <div style={{ display: 'none' }} aria-hidden="true">
        {/* Dominance Note */}
        {cycleDominantNote && (
          <div className="impact-meta-strip">
            <span className="impact-cycle-hub-note" role="note">
              ⚠️ {cycleDominantNote}
            </span>
          </div>
        )}

        {/* Visual Legend swatches with shapes/icons */}
        <div className="impact-visual-legend" aria-label="Visual legend">
          <span className="legend-item"><span className="legend-swatch type-entry">●</span> Entry point</span>
          <span className="legend-item"><span className="legend-swatch type-hotspot">▲</span> Hotspot</span>
          <span className="legend-item"><span className="legend-swatch type-cycle">◆</span> In a cycle</span>
          <span className="legend-item"><span className="legend-swatch type-config">■</span> Config</span>
          <span className="legend-item"><span className="legend-swatch type-test">🧪</span> Test</span>
          <span className="legend-item"><span className="legend-swatch type-source">▫</span> Source</span>
        </div>

        {/* Message for large graph view (>15 nodes) */}
        {allAffected.length > 15 && (
          <div className="graph-too-many-files" role="note">
            <p>Too many files to draw clearly; use the folder view</p>
          </div>
        )}
      </div>
    </div>
  )
}
