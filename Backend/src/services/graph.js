const path = require('path')

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.json']
const MAX_NODES = 3000

// Common Node.js built-in modules
const NODE_BUILTINS = new Set([
	'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
	'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
	'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
	'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
	'querystring', 'readline', 'repl', 'stream', 'stream/promises', 'stream/web',
	'string_decoder', 'test', 'timers', 'timers/promises', 'tls', 'trace_events',
	'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

function isNodeBuiltin(name) {
	if (!name) return false
	if (name.startsWith('node:')) return true
	return NODE_BUILTINS.has(name)
}

function normalizeExternalPackageName(specifier) {
	if (!specifier) return ''
	let clean = specifier.trim()
	if (clean.startsWith('node:')) {
		return clean
	}
	if (clean.startsWith('@')) {
		const parts = clean.split('/')
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`
		}
		return clean
	}
	return clean.split('/')[0]
}

/**
 * Tokenizes source code to extract import/require specifiers while ignoring comments and strings.
 */
function extractImportSpecifiers(sourceCode) {
	const specifiers = []
	if (!sourceCode || typeof sourceCode !== 'string') return specifiers

	let i = 0
	const n = sourceCode.length

	while (i < n) {
		const ch = sourceCode[i]

		// Single-line comment
		if (ch === '/' && sourceCode[i + 1] === '/') {
			i += 2
			while (i < n && sourceCode[i] !== '\n' && sourceCode[i] !== '\r') i++
			continue
		}

		// Multi-line comment
		if (ch === '/' && sourceCode[i + 1] === '*') {
			i += 2
			while (i < n && !(sourceCode[i] === '*' && sourceCode[i + 1] === '/')) i++
			if (i < n) i += 2
			continue
		}

		// String literals outside import/require statements
		if (ch === "'" || ch === '"' || ch === '`') {
			const quote = ch
			i++
			while (i < n) {
				if (sourceCode[i] === '\\') {
					i += 2
				} else if (sourceCode[i] === quote) {
					i++
					break
				} else {
					i++
				}
			}
			continue
		}

		// require('literal')
		if (
			sourceCode.startsWith('require', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1])) &&
			!/[\w$]/.test(sourceCode[i + 7] || '')
		) {
			let j = i + 7
			while (j < n && /\s/.test(sourceCode[j])) j++
			if (sourceCode[j] === '(') {
				j++
				while (j < n) {
					if (/\s/.test(sourceCode[j])) { j++; continue }
					if (sourceCode[j] === '/' && sourceCode[j + 1] === '/') {
						j += 2
						while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
						continue
					}
					if (sourceCode[j] === '/' && sourceCode[j + 1] === '*') {
						j += 2
						while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
						if (j < n) j += 2
						continue
					}
					break
				}
				if (sourceCode[j] === "'" || sourceCode[j] === '"' || sourceCode[j] === '`') {
					const q = sourceCode[j]
					j++
					let spec = ''
					let isDynamic = false
					while (j < n && sourceCode[j] !== q) {
						if (q === '`' && sourceCode[j] === '$' && sourceCode[j + 1] === '{') {
							isDynamic = true
							break
						}
						spec += sourceCode[j]
						j++
					}
					if (!isDynamic) {
						if (j < n) j++
						while (j < n && /\s/.test(sourceCode[j])) j++
						if (sourceCode[j] === ')') j++
						if (spec.trim()) specifiers.push(spec.trim())
						i = j
						continue
					}
				}
			}
		}

		// dynamic import('literal')
		if (
			sourceCode.startsWith('import', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1]))
		) {
			let j = i + 6
			while (j < n && /\s/.test(sourceCode[j])) j++
			if (sourceCode[j] === '(') {
				j++
				while (j < n) {
					if (/\s/.test(sourceCode[j])) { j++; continue }
					if (sourceCode[j] === '/' && sourceCode[j + 1] === '/') {
						j += 2
						while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
						continue
					}
					if (sourceCode[j] === '/' && sourceCode[j + 1] === '*') {
						j += 2
						while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
						if (j < n) j += 2
						continue
					}
					break
				}
				if (sourceCode[j] === "'" || sourceCode[j] === '"' || sourceCode[j] === '`') {
					const q = sourceCode[j]
					j++
					let spec = ''
					let isDynamic = false
					while (j < n && sourceCode[j] !== q) {
						if (q === '`' && sourceCode[j] === '$' && sourceCode[j + 1] === '{') {
							isDynamic = true
							break
						}
						spec += sourceCode[j]
						j++
					}
					if (!isDynamic) {
						if (j < n) j++
						while (j < n && /\s/.test(sourceCode[j])) j++
						if (sourceCode[j] === ')') j++
						if (spec.trim()) specifiers.push(spec.trim())
						i = j
						continue
					}
				}
			}
		}

		// static import statement: import ... from 'literal' OR import 'literal'
		if (
			sourceCode.startsWith('import', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1])) &&
			!/[\w$]/.test(sourceCode[i + 6] || '') &&
			sourceCode[i + 6] !== '.'
		) {
			let j = i + 6
			let foundSpecifier = null
			let inBraces = 0

			while (j < n) {
				if (sourceCode[j] === '/' && sourceCode[j + 1] === '/') {
					j += 2
					while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
					continue
				}
				if (sourceCode[j] === '/' && sourceCode[j + 1] === '*') {
					j += 2
					while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
					if (j < n) j += 2
					continue
				}

				if (sourceCode[j] === '{') inBraces++
				if (sourceCode[j] === '}') inBraces = Math.max(0, inBraces - 1)

				// String literal specifier
				if (sourceCode[j] === "'" || sourceCode[j] === '"') {
					const q = sourceCode[j]
					j++
					let spec = ''
					while (j < n && sourceCode[j] !== q) {
						spec += sourceCode[j]
						j++
					}
					if (j < n) j++
					foundSpecifier = spec
					break
				}

				if (sourceCode[j] === ';') {
					j++
					break
				}

				j++
			}

			if (foundSpecifier && foundSpecifier.trim()) {
				specifiers.push(foundSpecifier.trim())
				i = j
				continue
			}
		}

		// export ... from 'literal'
		if (
			sourceCode.startsWith('export', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1])) &&
			!/[\w$]/.test(sourceCode[i + 6] || '')
		) {
			const afterExport = sourceCode.slice(i + 6, i + 25).trimStart()
			if (/^(const|let|var|function|class|default|interface|enum)\b/.test(afterExport)) {
				i += 6
				continue
			}

			let j = i + 6
			let hasFrom = false
			let foundSpecifier = null
			let inBraces = 0

			while (j < n) {
				if (sourceCode[j] === '/' && sourceCode[j + 1] === '/') {
					j += 2
					while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
					continue
				}
				if (sourceCode[j] === '/' && sourceCode[j + 1] === '*') {
					j += 2
					while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
					if (j < n) j += 2
					continue
				}

				if (sourceCode[j] === '{') inBraces++
				if (sourceCode[j] === '}') inBraces = Math.max(0, inBraces - 1)

				if (
					inBraces === 0 &&
					sourceCode.startsWith('from', j) &&
					!/[\w$]/.test(sourceCode[j - 1] || '') &&
					!/[\w$]/.test(sourceCode[j + 4] || '')
				) {
					hasFrom = true
					j += 4
					continue
				}

				if (hasFrom && (sourceCode[j] === "'" || sourceCode[j] === '"')) {
					const q = sourceCode[j]
					j++
					let spec = ''
					while (j < n && sourceCode[j] !== q) {
						spec += sourceCode[j]
						j++
					}
					if (j < n) j++
					foundSpecifier = spec
					break
				}

				if (sourceCode[j] === ';') {
					j++
					break
				}

				j++
			}

			if (foundSpecifier && foundSpecifier.trim()) {
				specifiers.push(foundSpecifier.trim())
				i = j
				continue
			}
		}

		i++
	}

	return specifiers
}

/**
 * Extracts script content from Vue SFC files.
 */
function extractVueScript(content) {
	if (!content || typeof content !== 'string') return ''
	const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi
	let scripts = ''
	let match
	while ((match = scriptRegex.exec(content)) !== null) {
		scripts += match[1] + '\n'
	}
	return scripts || content
}

/**
 * Strips comments from JSON files before parsing (for tsconfig.json).
 */
function parseJsonWithComments(text) {
	if (!text) return null
	try {
		const clean = text
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*/g, '')
		return JSON.parse(clean)
	} catch {
		return null
	}
}

/**
 * Resolves a file path against the files map using extension & index resolution and TS mapping.
 */
function resolveFilePath(targetPath, filesMap) {
	const normalized = path.posix.normalize(targetPath).replace(/^\.\//, '')

	// 1. Exact match
	if (filesMap.has(normalized)) {
		return normalized
	}

	// 2. TypeScript .js -> .ts / .tsx mapping
	if (normalized.endsWith('.js')) {
		const asTs = normalized.slice(0, -3) + '.ts'
		if (filesMap.has(asTs)) return asTs
		const asTsx = normalized.slice(0, -3) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
	}
	if (normalized.endsWith('.jsx')) {
		const asTsx = normalized.slice(0, -4) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
	}
	if (normalized.endsWith('.mjs')) {
		const asMts = normalized.slice(0, -4) + '.mts'
		if (filesMap.has(asMts)) return asMts
	}
	if (normalized.endsWith('.cjs')) {
		const asCts = normalized.slice(0, -4) + '.cts'
		if (filesMap.has(asCts)) return asCts
	}

	// 3. Try appending extensions
	for (const ext of RESOLVE_EXTENSIONS) {
		const withExt = normalized + ext
		if (filesMap.has(withExt)) {
			return withExt
		}
	}

	// 4. Try index files in directory
	for (const ext of RESOLVE_EXTENSIONS) {
		const asIndex = path.posix.join(normalized, 'index' + ext)
		if (filesMap.has(asIndex)) {
			return asIndex
		}
	}

	return null
}

/**
 * Builds the dependency graph from files and packages.
 */
function buildGraph(files, packageJsons = []) {
	const filesMap = new Map()
	for (const [p, val] of (files instanceof Map ? files.entries() : Object.entries(files || {}))) {
		if (typeof val === 'string') {
			filesMap.set(p, {
				text: val,
				size: Buffer.byteLength(val, 'utf8'),
				lang: path.posix.extname(p).slice(1) || 'javascript',
			})
		} else if (val && typeof val === 'object') {
			filesMap.set(p, val)
		}
	}

	// Collect all package.json files
	const parsedPackageJsons = []
	if (Array.isArray(packageJsons) && packageJsons.length > 0) {
		parsedPackageJsons.push(...packageJsons)
	} else {
		for (const [filePath, fileData] of filesMap.entries()) {
			if (filePath === 'package.json' || filePath.endsWith('/package.json')) {
				if (fileData.text) {
					try {
						const pkg = JSON.parse(fileData.text)
						parsedPackageJsons.push({ path: filePath, content: pkg })
					} catch {
						// Ignore parse error
					}
				}
			}
		}
	}

	// Build map of monorepo workspace packages
	const workspacePackages = new Map()
	const allDeclaredDependencies = new Set()

	for (const pkgItem of parsedPackageJsons) {
		const pkg = pkgItem.content || pkgItem
		const pkgPath = pkgItem.path || 'package.json'
		const dir = path.posix.dirname(pkgPath)

		if (pkg.name) {
			workspacePackages.set(pkg.name, {
				dir: dir === '.' ? '' : dir,
				main: pkg.main || pkg.module,
			})
		}

		const deps = {
			...(pkg.dependencies || {}),
			...(pkg.devDependencies || {}),
			...(pkg.peerDependencies || {}),
			...(pkg.optionalDependencies || {}),
		}
		for (const depName of Object.keys(deps)) {
			allDeclaredDependencies.add(depName)
		}
	}

	// Read tsconfig / jsconfig paths and baseUrl
	let tsconfigPaths = null
	let tsconfigBaseUrl = '.'
	for (const configName of ['tsconfig.json', 'jsconfig.json']) {
		if (filesMap.has(configName) && filesMap.get(configName).text) {
			const config = parseJsonWithComments(filesMap.get(configName).text)
			if (config && config.compilerOptions) {
				if (config.compilerOptions.baseUrl) {
					tsconfigBaseUrl = config.compilerOptions.baseUrl.replace(/^[./]+/, '') || '.'
				}
				if (config.compilerOptions.paths && typeof config.compilerOptions.paths === 'object') {
					tsconfigPaths = config.compilerOptions.paths
				}
			}
			break
		}
	}

	// Identify candidate code files
	const codeFileEntries = []
	for (const [filePath, fileData] of filesMap.entries()) {
		const ext = path.posix.extname(filePath).toLowerCase()
		if (CODE_EXTENSIONS.has(ext)) {
			codeFileEntries.push([filePath, fileData])
		}
	}

	let truncated = false
	if (codeFileEntries.length > MAX_NODES) {
		truncated = true
		codeFileEntries.length = MAX_NODES
	}

	// Create nodes
	const nodes = []
	const pathToId = new Map()

	codeFileEntries.forEach(([filePath, fileData], index) => {
		const id = index
		pathToId.set(filePath, id)
		const lines = fileData.text ? fileData.text.split(/\r?\n/).length : 0

		nodes.push({
			id,
			path: filePath,
			lang: fileData.lang,
			size: fileData.size || 0,
			loc: lines,
			fanIn: 0,
			fanOut: 0,
			isEntry: false,
			isOrphan: false,
		})
	})

	// Detect entry points
	const entryPointsSet = new Set()
	const rootPkg = parsedPackageJsons.find((p) => (p.path || '') === 'package.json')
	if (rootPkg && rootPkg.content) {
		const p = rootPkg.content
		if (p.main) entryPointsSet.add(path.posix.normalize(p.main).replace(/^\.\//, ''))
		if (p.module) entryPointsSet.add(path.posix.normalize(p.module).replace(/^\.\//, ''))
		if (p.bin) {
			if (typeof p.bin === 'string') {
				entryPointsSet.add(path.posix.normalize(p.bin).replace(/^\.\//, ''))
			} else if (typeof p.bin === 'object') {
				for (const binPath of Object.values(p.bin)) {
					if (typeof binPath === 'string') {
						entryPointsSet.add(path.posix.normalize(binPath).replace(/^\.\//, ''))
					}
				}
			}
		}
		if (p.scripts && typeof p.scripts === 'object') {
			for (const script of Object.values(p.scripts)) {
				const scriptTokens = script.split(/\s+/)
				for (const token of scriptTokens) {
					if (token.endsWith('.js') || token.endsWith('.ts') || token.endsWith('.jsx') || token.endsWith('.tsx')) {
						entryPointsSet.add(path.posix.normalize(token).replace(/^\.\//, ''))
					}
				}
			}
		}
	}

	// Also common entry point file patterns
	for (const node of nodes) {
		const base = path.posix.basename(node.path).toLowerCase()
		const isCommonEntry =
			base.startsWith('index.') ||
			base.startsWith('main.') ||
			base.startsWith('app.') ||
			base.startsWith('server.')
		if (isCommonEntry || entryPointsSet.has(node.path)) {
			node.isEntry = true
		}
	}

	// Resolve imports and construct edges
	const edges = []
	const edgeSet = new Set()
	const externalsMap = new Map()
	let unresolvedCount = 0

	for (const node of nodes) {
		const fileData = filesMap.get(node.path)
		if (!fileData || !fileData.text) continue

		let source = fileData.text
		if (node.path.endsWith('.vue')) {
			source = extractVueScript(source)
		}

		const specifiers = extractImportSpecifiers(source)

		for (const specifier of specifiers) {
			let resolvedPath = null

			if (specifier.startsWith('./') || specifier.startsWith('../')) {
				// Relative import
				const fromDir = path.posix.dirname(node.path)
				const target = path.posix.join(fromDir, specifier)
				resolvedPath = resolveFilePath(target, filesMap)
				if (!resolvedPath) {
					unresolvedCount++
				}
			} else if (tsconfigPaths) {
				// Try tsconfig / jsconfig paths matching
				for (const [pattern, targetList] of Object.entries(tsconfigPaths)) {
					if (pattern.endsWith('*')) {
						const prefix = pattern.slice(0, -1)
						if (specifier.startsWith(prefix)) {
							const starValue = specifier.slice(prefix.length)
							for (const targetPattern of targetList) {
								const candidateTarget = targetPattern.replace('*', starValue)
								const fullCandidate = tsconfigBaseUrl === '.'
									? candidateTarget
									: path.posix.join(tsconfigBaseUrl, candidateTarget)
								resolvedPath = resolveFilePath(fullCandidate, filesMap)
								if (resolvedPath) break
							}
						}
					} else if (specifier === pattern) {
						for (const targetPattern of targetList) {
							const fullCandidate = tsconfigBaseUrl === '.'
								? targetPattern
								: path.posix.join(tsconfigBaseUrl, targetPattern)
							resolvedPath = resolveFilePath(fullCandidate, filesMap)
							if (resolvedPath) break
						}
					}
					if (resolvedPath) break
				}
			}

			// Try tsconfig / jsconfig baseUrl fallback
			if (!resolvedPath && tsconfigBaseUrl && tsconfigBaseUrl !== '.' && !specifier.startsWith('./') && !specifier.startsWith('../')) {
				const candidate = path.posix.join(tsconfigBaseUrl, specifier)
				resolvedPath = resolveFilePath(candidate, filesMap)
			}

			// Check monorepo workspace packages
			if (!resolvedPath && workspacePackages.size > 0) {
				for (const [pkgName, pkgMeta] of workspacePackages.entries()) {
					if (specifier === pkgName || specifier.startsWith(pkgName + '/')) {
						const subpath = specifier.slice(pkgName.length).replace(/^\//, '')
						if (!subpath) {
							if (pkgMeta.main) {
								const candidate = path.posix.join(pkgMeta.dir, pkgMeta.main)
								resolvedPath = resolveFilePath(candidate, filesMap)
							}
							if (!resolvedPath) {
								resolvedPath = resolveFilePath(path.posix.join(pkgMeta.dir, 'index'), filesMap)
							}
						} else {
							resolvedPath = resolveFilePath(path.posix.join(pkgMeta.dir, subpath), filesMap)
						}
						if (resolvedPath) break
					}
				}
			}

			if (resolvedPath && pathToId.has(resolvedPath)) {
				const toId = pathToId.get(resolvedPath)
				const edgeKey = `${node.id}->${toId}`
				if (!edgeSet.has(edgeKey) && node.id !== toId) {
					edgeSet.add(edgeKey)
					edges.push([node.id, toId])
				}
			} else if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
				// Bare specifier = External package
				const normName = normalizeExternalPackageName(specifier)
				if (normName) {
					externalsMap.set(normName, (externalsMap.get(normName) || 0) + 1)
				}
			}
		}
	}

	// Calculate fanIn and fanOut
	for (const [fromId, toId] of edges) {
		if (nodes[fromId]) nodes[fromId].fanOut++
		if (nodes[toId]) nodes[toId].fanIn++
	}

	// Identify orphans
	const orphans = []
	for (const node of nodes) {
		if (node.fanIn === 0 && node.fanOut === 0 && !node.isEntry) {
			node.isOrphan = true
			orphans.push(node.path)
		}
	}

	// Detect Cycles using Tarjan's SCC algorithm
	const cycles = []
	const adj = new Map()
	for (const node of nodes) adj.set(node.id, [])
	for (const [fromId, toId] of edges) adj.get(fromId).push(toId)

	let tarjanIndex = 0
	const indices = new Map()
	const lowlink = new Map()
	const onStack = new Set()
	const stack = []

	function strongConnect(u) {
		indices.set(u, tarjanIndex)
		lowlink.set(u, tarjanIndex)
		tarjanIndex++
		stack.push(u)
		onStack.add(u)

		for (const v of adj.get(u) || []) {
			if (!indices.has(v)) {
				strongConnect(v)
				lowlink.set(u, Math.min(lowlink.get(u), lowlink.get(v)))
			} else if (onStack.has(v)) {
				lowlink.set(u, Math.min(lowlink.get(u), indices.get(v)))
			}
		}

		if (lowlink.get(u) === indices.get(u)) {
			const scc = []
			let w
			do {
				w = stack.pop()
				onStack.delete(w)
				scc.push(w)
			} while (w !== u)

			if (scc.length > 1 && cycles.length < 20) {
				cycles.push(scc.map((id) => nodes[id].path))
			}
		}
	}

	for (const node of nodes) {
		if (!indices.has(node.id)) {
			strongConnect(node.id)
		}
	}

	// Longest dependency chain (topological depth)
	const memoChain = new Map()
	const visiting = new Set()

	function getChainLength(u) {
		if (memoChain.has(u)) return memoChain.get(u)
		if (visiting.has(u)) return 0 // cycle break
		visiting.add(u)

		let maxSub = 0
		for (const v of adj.get(u) || []) {
			maxSub = Math.max(maxSub, getChainLength(v))
		}

		visiting.delete(u)
		const res = 1 + maxSub
		memoChain.set(u, res)
		return res
	}

	let longestChain = 0
	for (const node of nodes) {
		longestChain = Math.max(longestChain, getChainLength(node.id))
	}

	// Build compact externals
	const externals = []
	const usedExternalNames = new Set()
	for (const [name, count] of externalsMap.entries()) {
		const isBuiltin = isNodeBuiltin(name)
		const isDeclared = allDeclaredDependencies.has(name) || isBuiltin
		usedExternalNames.add(name)
		externals.push({
			name,
			count,
			declared: isDeclared,
		})
	}

	externals.sort((a, b) => b.count - a.count)

	const declaredButUnused = []
	for (const dep of allDeclaredDependencies) {
		if (!externalsMap.has(dep) && !isNodeBuiltin(dep)) {
			declaredButUnused.push(dep)
		}
	}

	const usedButUndeclared = []
	for (const [name] of externalsMap.entries()) {
		if (!allDeclaredDependencies.has(name) && !isNodeBuiltin(name)) {
			usedButUndeclared.push(name)
		}
	}

	// Calculate hotspots
	// 1. Top 10 by fanIn
	const sortedByFanIn = [...nodes]
		.filter((n) => n.fanIn > 0)
		.sort((a, b) => b.fanIn - a.fanIn)
		.slice(0, 10)
		.map((n) => ({ id: n.id, path: n.path, fanIn: n.fanIn }))

	// 2. Top 10 by transitive impact (reverse BFS)
	const incomingAdj = new Map()
	for (const node of nodes) incomingAdj.set(node.id, [])
	for (const [fromId, toId] of edges) incomingAdj.get(toId).push(fromId)

	const impactScores = []
	for (const node of nodes) {
		let count = 0
		const visited = new Set([node.id])
		const queue = [node.id]
		while (queue.length > 0) {
			const curr = queue.shift()
			for (const parent of incomingAdj.get(curr) || []) {
				if (!visited.has(parent)) {
					visited.add(parent)
					count++
					queue.push(parent)
				}
			}
		}
		if (count > 0) {
			impactScores.push({
				id: node.id,
				path: node.path,
				transitiveCount: count,
				percent: nodes.length > 0 ? Number(((count / nodes.length) * 100).toFixed(1)) : 0,
			})
		}
	}

	impactScores.sort((a, b) => b.transitiveCount - a.transitiveCount)
	const sortedByTransitiveImpact = impactScores.slice(0, 10)

	const graphResult = {
		nodes,
		edges,
		externals,
		summary: {
			entryPoints: nodes.filter((n) => n.isEntry).map((n) => n.path),
			cycles,
			orphans,
			hotspots: {
				byFanIn: sortedByFanIn,
				byTransitiveImpact: sortedByTransitiveImpact,
			},
			declaredButUnused,
			usedButUndeclared,
			longestChain,
			unresolvedCount,
			parsedFiles: nodes.length,
			approximate: true,
		},
		truncated,
	}

	return graphResult
}

/**
 * Returns direct and transitive impact of fileId using reverse BFS.
 */
function getImpact(graph, fileId) {
	if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
		return { direct: [], transitive: [], percentOfRepo: 0 }
	}

	const cleanFileId = typeof fileId === 'string' ? fileId.replace(/^\.\//, '') : fileId
	let targetNode = null
	if (typeof fileId === 'number') {
		targetNode = graph.nodes.find((n) => n.id === fileId)
	} else if (typeof fileId === 'string') {
		targetNode = graph.nodes.find(
			(n) => n.path === fileId || n.path === cleanFileId || String(n.id) === fileId
		)
	}

	if (!targetNode) {
		return { direct: [], transitive: [], percentOfRepo: 0 }
	}

	// Incoming adjacency list: toId -> [fromId]
	const incoming = new Map()
	for (const [fromId, toId] of graph.edges) {
		if (!incoming.has(toId)) incoming.set(toId, [])
		incoming.get(toId).push(fromId)
	}

	const directIds = incoming.get(targetNode.id) || []
	const direct = directIds.map((id) => {
		const node = graph.nodes.find((n) => n.id === id)
		return node ? node.path : id
	})

	const transitiveSet = new Set()
	const queue = [...directIds]
	for (const id of directIds) transitiveSet.add(id)

	while (queue.length > 0) {
		const current = queue.shift()
		const parents = incoming.get(current) || []
		for (const parent of parents) {
			if (!transitiveSet.has(parent) && parent !== targetNode.id) {
				transitiveSet.add(parent)
				queue.push(parent)
			}
		}
	}

	const transitive = Array.from(transitiveSet).map((id) => {
		const node = graph.nodes.find((n) => n.id === id)
		return node ? node.path : id
	})

	const totalNodes = graph.nodes.length
	const percentOfRepo = totalNodes > 0
		? Number(((transitive.length / totalNodes) * 100).toFixed(1))
		: 0

	return {
		direct,
		transitive,
		percentOfRepo,
	}
}

module.exports = {
	buildGraph,
	getImpact,
	extractImportSpecifiers,
	normalizeExternalPackageName,
}
