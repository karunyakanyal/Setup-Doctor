/**
 * SetupDoctor Graph Impact Utilities
 * Pure functions for analyzing direct and transitive file dependencies and repo impact.
 */

/**
 * Returns direct and transitive impact of targetFile within the graph via reverse BFS traversal.
 * Edge convention: [fromId, toId] means fromId imports toId.
 * Therefore, when toId changes, fromId is directly affected (it depends on toId).
 *
 * @param {Object} graph - { nodes: Array<{ id, path, ... }>, edges: Array<[fromId, toId]> }
 * @param {string|number} targetFile - File path or numeric node id
 * @returns {Object} {
 *   targetNode: Object|null,
 *   direct: string[],
 *   transitive: string[],
 *   percentOfRepo: number,
 *   transitiveByFolder: Record<string, string[]>
 * }
 */
export function getImpact(graph, targetFile) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return {
      targetNode: null,
      direct: [],
      transitive: [],
      percentOfRepo: 0,
      transitiveByFolder: {},
      directBreakdown: { source: 0, tests: 0 },
      transitiveBreakdown: { source: 0, tests: 0 },
      directText: '0 direct: 0 source, 0 tests',
      transitiveText: '0 transitive: 0 source, 0 tests',
    }
  }

  const nodes = graph.nodes
  const edges = graph.edges

  // Map for fast node lookups
  const idToNode = new Map()
  const pathToNode = new Map()
  for (const node of nodes) {
    idToNode.set(node.id, node)
    pathToNode.set(node.path, node)
  }

  let targetNode = null
  if (typeof targetFile === 'number') {
    targetNode = idToNode.get(targetFile) || null
  } else if (typeof targetFile === 'string') {
    const clean = targetFile.replace(/^\.\//, '')
    targetNode = pathToNode.get(targetFile) || pathToNode.get(clean) || null
    if (!targetNode && !Number.isNaN(Number(targetFile))) {
      targetNode = idToNode.get(Number(targetFile)) || null
    }
  }

  if (!targetNode) {
    return {
      targetNode: null,
      direct: [],
      transitive: [],
      percentOfRepo: 0,
      transitiveByFolder: {},
      directBreakdown: { source: 0, tests: 0 },
      transitiveBreakdown: { source: 0, tests: 0 },
      directText: '0 direct: 0 source, 0 tests',
      transitiveText: '0 transitive: 0 source, 0 tests',
    }
  }

  // Incoming adjacency: toId -> [fromId] (who imports toId)
  const incoming = new Map()
  for (const [fromId, toId] of edges) {
    if (!incoming.has(toId)) incoming.set(toId, [])
    incoming.get(toId).push(fromId)
  }

  const directIds = incoming.get(targetNode.id) || []
  const direct = directIds
    .map((id) => idToNode.get(id)?.path)
    .filter(Boolean)

  const visited = new Set(directIds)
  const queue = [...directIds]

  while (queue.length > 0) {
    const current = queue.shift()
    const parents = incoming.get(current) || []
    for (const parent of parents) {
      if (!visited.has(parent) && parent !== targetNode.id) {
        visited.add(parent)
        queue.push(parent)
      }
    }
  }

  const directSet = new Set(directIds)
  const transitive = Array.from(visited)
    .filter((id) => !directSet.has(id))
    .map((id) => idToNode.get(id)?.path)
    .filter(Boolean)

  const totalAffected = direct.length + transitive.length
  const totalNodes = nodes.length
  const percentOfRepo = totalNodes > 0
    ? Number(((totalAffected / totalNodes) * 100).toFixed(1))
    : 0

  // Group transitive files by folder
  const transitiveByFolder = {}
  for (const filePath of transitive) {
    const parts = filePath.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    if (!transitiveByFolder[folder]) {
      transitiveByFolder[folder] = []
    }
    transitiveByFolder[folder].push(filePath)
  }

  let directSource = 0
  let directTests = 0
  for (const filePath of direct) {
    const node = pathToNode.get(filePath)
    if (node?.category === 'production') {
      directSource++
    } else {
      directTests++
    }
  }

  let transitiveSource = 0
  let transitiveTests = 0
  for (const filePath of transitive) {
    const node = pathToNode.get(filePath)
    if (node?.category === 'production') {
      transitiveSource++
    } else {
      transitiveTests++
    }
  }

  return {
    targetNode,
    direct,
    transitive,
    totalAffected,
    percentOfRepo,
    transitiveByFolder,
    directBreakdown: {
      source: directSource,
      tests: directTests,
    },
    transitiveBreakdown: {
      source: transitiveSource,
      tests: transitiveTests,
    },
    directText: `${direct.length} direct: ${directSource} source, ${directTests} tests`,
    transitiveText: `${transitive.length} transitive: ${transitiveSource} source, ${transitiveTests} tests`,
  }
}

/**
 * Computes whether targetFile is part of a circular dependency, and if so,
 * how many files are affected ONLY through the cycle (overstated impact).
 *
 * @param {Object} graph - { nodes: Array<{ id, path }>, edges: Array<[fromId, toId]> }
 * @param {Array} cycles - List of cycles from graph summary
 * @param {string|number} targetFile - File path or node id
 * @returns {Object} { inCycle: boolean, overstatedCount: number }
 */
export function getCycleOverstatedImpact(graph, cycles, targetFile) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(cycles) || !targetFile) {
    return { inCycle: false, overstatedCount: 0 }
  }

  const clean = typeof targetFile === 'string' ? targetFile.replace(/^\.\//, '') : targetFile
  const targetNode = graph.nodes.find((n) => n.path === targetFile || n.path === clean || n.id === targetFile)
  if (!targetNode) {
    return { inCycle: false, overstatedCount: 0 }
  }

  const cycle = cycles.find((c) => {
    const files = Array.isArray(c) ? c : (c.files || c.shortest || [])
    return files.includes(targetNode.path) || files.includes(targetFile) || files.includes(clean)
  })

  if (!cycle) {
    return { inCycle: false, overstatedCount: 0 }
  }

  const cycleFiles = Array.isArray(cycle) ? cycle : (cycle.files || cycle.shortest || [])
  const cycleNodeIds = new Set(
    cycleFiles
      .map((p) => graph.nodes.find((n) => n.path === p)?.id)
      .filter((id) => id !== undefined)
  )

  const incoming = new Map()
  for (const [fromId, toId] of graph.edges) {
    if (!incoming.has(toId)) incoming.set(toId, [])
    incoming.get(toId).push(fromId)
  }

  // 1. Full affected set (reverse BFS)
  const fullAffected = new Set()
  const fullQueue = [targetNode.id]
  while (fullQueue.length > 0) {
    const curr = fullQueue.shift()
    for (const parent of incoming.get(curr) || []) {
      if (!fullAffected.has(parent) && parent !== targetNode.id) {
        fullAffected.add(parent)
        fullQueue.push(parent)
      }
    }
  }

  // 2. Non-cycle affected set: reverse BFS without expanding past other cycle members
  const nonCycleAffected = new Set()
  const nonCycleQueue = [targetNode.id]
  while (nonCycleQueue.length > 0) {
    const curr = nonCycleQueue.shift()
    if (curr !== targetNode.id && cycleNodeIds.has(curr)) {
      continue
    }
    for (const parent of incoming.get(curr) || []) {
      if (!nonCycleAffected.has(parent) && parent !== targetNode.id) {
        nonCycleAffected.add(parent)
        nonCycleQueue.push(parent)
      }
    }
  }

  let overstatedCount = 0
  for (const id of fullAffected) {
    if (!nonCycleAffected.has(id)) {
      overstatedCount++
    }
  }

  return {
    inCycle: true,
    overstatedCount,
  }
}


/**
 * Returns outgoing imports and incoming importers for targetFile.
 */
export function getFileConnections(graph, targetFile) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { targetNode: null, imports: [], importers: [] }
  }

  const nodes = graph.nodes
  const edges = graph.edges

  const idToNode = new Map()
  const pathToNode = new Map()
  for (const node of nodes) {
    idToNode.set(node.id, node)
    pathToNode.set(node.path, node)
  }

  let targetNode = null
  if (typeof targetFile === 'number') {
    targetNode = idToNode.get(targetFile) || null
  } else if (typeof targetFile === 'string') {
    const clean = targetFile.replace(/^\.\//, '')
    targetNode = pathToNode.get(targetFile) || pathToNode.get(clean) || null
  }

  if (!targetNode) {
    return { targetNode: null, imports: [], importers: [] }
  }

  const outgoingIds = []
  const incomingIds = []

  for (const [fromId, toId] of edges) {
    if (fromId === targetNode.id) outgoingIds.push(toId)
    if (toId === targetNode.id) incomingIds.push(fromId)
  }

  const imports = outgoingIds.map((id) => idToNode.get(id)?.path).filter(Boolean)
  const importers = incomingIds.map((id) => idToNode.get(id)?.path).filter(Boolean)

  return {
    targetNode,
    imports,
    importers,
  }
}
