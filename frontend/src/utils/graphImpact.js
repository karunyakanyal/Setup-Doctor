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

  const transitive = Array.from(visited)
    .map((id) => idToNode.get(id)?.path)
    .filter(Boolean)

  const totalNodes = nodes.length
  const percentOfRepo = totalNodes > 0
    ? Number(((transitive.length / totalNodes) * 100).toFixed(1))
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

  return {
    targetNode,
    direct,
    transitive,
    percentOfRepo,
    transitiveByFolder,
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
