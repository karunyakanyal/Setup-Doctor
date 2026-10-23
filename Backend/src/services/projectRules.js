const path = require('path')
const {
	formatSnippet,
	findLineAndSnippet,
	createRuleResult,
} = require('./ruleEngine')
const {
	extractProductionDepsFromLockfile,
	queryOsvVulnerabilities,
	getCachedOsvVulnerabilities,
} = require('./osv')

/**
 * Secret patterns with masking to first 4 chars.
 */
const SECRET_PATTERNS = [
	{ name: 'AWS Access Key', regex: /\b(AKIA[0-9A-Z]{16})\b/g },
	{ name: 'GitHub Token', regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/g },
	{ name: 'Slack Token', regex: /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g },
	{
		name: 'API Secret',
		regex: /(?:api_key|apikey|secret_key|secret_token|private_key|auth_token)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"]/gi,
	},
	{ name: 'Private Key', regex: /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g },
]

const PLACEHOLDER_SECRET_TEST = /dummy|example|placeholder|changeme|your[-_]api|00000|12345|xxx/i

function getNearestPkg(filePath, parsedPackageJsons = []) {
	if (!filePath) return null
	const norm = path.posix.normalize(filePath)
	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0]
	const nested = parsedPackageJsons
		.filter((p) => p.dir && norm.startsWith(`${p.dir}/`))
		.sort((a, b) => b.dir.length - a.dir.length)
	return nested[0] || rootPkg
}

function maskSecret(str) {
	if (!str || typeof str !== 'string') return '****'
	const prefix = str.slice(0, 4)
	return `${prefix}****`
}

/**
 * Extract project profile:
 * stacks, scripts, entry points, test framework, CI provider, Node version sources, API routes, env vars
 */
function joinRoutePaths(...parts) {
	const segments = []
	for (const part of parts) {
		if (!part || typeof part !== 'string') continue
		const trimmed = part.trim()
		if (!trimmed || trimmed === '/') continue
		const cleaned = trimmed.replace(/^\/+|\/+$/g, '')
		if (cleaned) {
			segments.push(cleaned)
		}
	}
	if (segments.length === 0) return '/'
	return '/' + segments.join('/')
}

function resolveFilePath(fromFile, relativeTarget, allFiles) {
	if (!relativeTarget) return null
	const fromParts = fromFile.split('/')
	fromParts.pop()

	const targetParts = relativeTarget.replace(/\\/g, '/').split('/')
	for (const p of targetParts) {
		if (p === '.' || !p) continue
		if (p === '..') {
			if (fromParts.length > 0) fromParts.pop()
		} else {
			fromParts.push(p)
		}
	}
	const baseResolved = fromParts.join('/')
	const candidates = [
		baseResolved,
		`${baseResolved}.js`,
		`${baseResolved}.ts`,
		`${baseResolved}.mjs`,
		`${baseResolved}.cjs`,
		`${baseResolved}.py`,
		`${baseResolved}/index.js`,
		`${baseResolved}/index.ts`,
		`${baseResolved}/__init__.py`,
	]
	for (const c of candidates) {
		if (allFiles.has(c)) return c
	}
	for (const f of allFiles) {
		if (f.endsWith(baseResolved) || f.endsWith(`${baseResolved}.js`) || f.endsWith(`${baseResolved}.ts`)) {
			return f
		}
	}
	return null
}

function resolvePythonModule(fromFile, modulePath, allFiles) {
	if (!modulePath) return null
	const normPath = modulePath.replace(/^\.+/, '').replace(/\./g, '/')
	const isRelative = modulePath.startsWith('.')

	if (isRelative) {
		const fromParts = fromFile.split('/')
		fromParts.pop()
		const relPath = fromParts.length > 0 ? `${fromParts.join('/')}/${normPath}` : normPath
		if (allFiles.has(`${relPath}.py`)) return `${relPath}.py`
		if (allFiles.has(`${relPath}/__init__.py`)) return `${relPath}/__init__.py`
	}

	if (allFiles.has(`${normPath}.py`)) return `${normPath}.py`
	if (allFiles.has(`${normPath}/__init__.py`)) return `${normPath}/__init__.py`

	for (const f of allFiles) {
		if (f.endsWith(`${normPath}.py`) || f.endsWith(`${normPath}/__init__.py`)) {
			return f
		}
	}
	return null
}

function extractProjectRoutes(filesMap = new Map(), isNonProductionFile = () => false) {
	const allFiles = new Set(filesMap.keys())
	const routerDefs = new Map()
	const importsMap = new Map()
	const mounts = []
	const rawRoutes = []

	for (const [filePath, fileData] of filesMap.entries()) {
		if (isNonProductionFile(filePath) || !fileData?.text) continue
		const text = fileData.text
		const isPy = filePath.endsWith('.py')

		const fileRouters = new Map()
		routerDefs.set(filePath, fileRouters)

		const fileImports = new Map()
		importsMap.set(filePath, fileImports)

		if (isPy) {
			// Python imports: from foo.bar import baz [as qux]
			const fromImportRegex = /from\s+([\w.]+)\s+import\s+([^#\n]+)/g
			let fm
			while ((fm = fromImportRegex.exec(text)) !== null) {
				const modPath = fm[1]
				const items = fm[2].split(',')
				for (const item of items) {
					const parts = item.trim().split(/\s+as\s+/)
					const name = parts[0]?.trim()
					const alias = parts[1]?.trim() || name
					if (name) {
						const resolved = resolvePythonModule(filePath, `${modPath}.${name}`, allFiles) ||
							resolvePythonModule(filePath, modPath, allFiles)
						if (resolved) {
							fileImports.set(alias, { targetFile: resolved, targetVar: name })
						}
					}
				}
			}

			// import foo.bar [as qux]
			const importRegex = /import\s+([\w.]+)(?:\s+as\s+(\w+))?/g
			let im
			while ((im = importRegex.exec(text)) !== null) {
				const modPath = im[1]
				const alias = im[2] || modPath.split('.').pop()
				const resolved = resolvePythonModule(filePath, modPath, allFiles)
				if (resolved) {
					fileImports.set(alias, { targetFile: resolved, targetVar: 'router' })
				}
			}

			// FastAPI APIRouter(prefix="/...")
			const pyRouterRegex = /(\w+)\s*=\s*(?:fastapi\.)?APIRouter\s*\(([^)]*)\)/g
			let rm
			while ((rm = pyRouterRegex.exec(text)) !== null) {
				const varName = rm[1]
				const args = rm[2] || ''
				const pMatch = /prefix\s*=\s*['"]([^'"]+)['"]/.exec(args)
				fileRouters.set(varName, pMatch ? pMatch[1] : '')
			}

			// Flask Blueprint(..., url_prefix="/...")
			const bpRegex = /(\w+)\s*=\s*(?:flask\.)?Blueprint\s*\([^)]*url_prefix\s*=\s*['"]([^'"]+)['"]/g
			let bpm
			while ((bpm = bpRegex.exec(text)) !== null) {
				fileRouters.set(bpm[1], bpm[2] || '')
			}

			// FastAPI include_router / Flask register_blueprint
			const incRegex = /(\w+)\.include_router\s*\(([^)]+)\)/g
			let incm
			while ((incm = incRegex.exec(text)) !== null) {
				const parentVar = incm[1]
				const args = incm[2]
				const pMatch = /prefix\s*=\s*['"]([^'"]+)['"]/.exec(args)
				const mountPrefix = pMatch ? pMatch[1] : ''

				const targetMatch = /(?:router\s*=\s*)?([\w.]+)/.exec(args)
				if (targetMatch) {
					const fullTarget = targetMatch[1]
					const [modOrVar, prop] = fullTarget.split('.')
					let targetFile = filePath
					let targetVar = modOrVar

					if (prop) {
						const imp = fileImports.get(modOrVar)
						if (imp) {
							targetFile = imp.targetFile
							targetVar = prop
						}
					} else {
						const imp = fileImports.get(modOrVar)
						if (imp) {
							targetFile = imp.targetFile
							targetVar = imp.targetVar || 'router'
						}
					}

					mounts.push({
						parentFile: filePath,
						parentVar,
						mountPrefix,
						childFile: targetFile,
						childVar: targetVar,
					})
				}
			}

			// Flask register_blueprint
			const regBpRegex = /(\w+)\.register_blueprint\s*\(([^)]+)\)/g
			let rbm
			while ((rbm = regBpRegex.exec(text)) !== null) {
				const parentVar = rbm[1]
				const args = rbm[2]
				const pMatch = /url_prefix\s*=\s*['"]([^'"]+)['"]/.exec(args)
				const mountPrefix = pMatch ? pMatch[1] : ''
				const tMatch = /([\w.]+)/.exec(args)
				if (tMatch) {
					const fullTarget = tMatch[1]
					const imp = fileImports.get(fullTarget)
					mounts.push({
						parentFile: filePath,
						parentVar,
						mountPrefix,
						childFile: imp ? imp.targetFile : filePath,
						childVar: imp ? (imp.targetVar || fullTarget) : fullTarget,
					})
				}
			}

			// Python route decorators
			const pyRouteRegex = /@(\w+)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"]([^'"]*)['"]/gi
			let pr
			while ((pr = pyRouteRegex.exec(text)) !== null) {
				const receiver = pr[1]
				const method = pr[2].toUpperCase()
				const rPath = pr[3] || '/'
				const line = text.slice(0, pr.index).split(/\r?\n/).length
				const fullLine = text.split(/\r?\n/)[line - 1] || ''
				rawRoutes.push({
					file: filePath,
					line,
					method,
					path: rPath,
					snippet: formatSnippet(fullLine, 120),
					receiver,
				})
			}

			// Flask @bp.route(...)
			const pyFlaskRouteRegex = /@(\w+)\.route\s*\(\s*['"]([^'"]*)['"](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/gi
			let pfr
			while ((pfr = pyFlaskRouteRegex.exec(text)) !== null) {
				const receiver = pfr[1]
				const rPath = pfr[2] || '/'
				const methodsStr = pfr[3]
				const line = text.slice(0, pfr.index).split(/\r?\n/).length
				const fullLine = text.split(/\r?\n/)[line - 1] || ''
				if (methodsStr) {
					const methods = methodsStr.replace(/['"\s]/g, '').split(',')
					for (const m of methods) {
						if (m) {
							rawRoutes.push({
								file: filePath,
								line,
								method: m.toUpperCase(),
								path: rPath,
								snippet: formatSnippet(fullLine, 120),
								receiver,
							})
						}
					}
				} else {
					rawRoutes.push({
						file: filePath,
						line,
						method: 'GET',
						path: rPath,
						snippet: formatSnippet(fullLine, 120),
						receiver,
					})
				}
			}
		} else {
			// JS / TS files
			const reqRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
			let rq
			while ((rq = reqRegex.exec(text)) !== null) {
				const varName = rq[1]
				const relPath = rq[2]
				const resolved = resolveFilePath(filePath, relPath, allFiles)
				if (resolved) {
					fileImports.set(varName, { targetFile: resolved, targetVar: 'default' })
				}
			}

			const esmImportRegex = /import\s+(?:(\w+)|\{\s*(\w+)\s*\})\s+from\s+['"]([^'"]+)['"]/g
			let esm
			while ((esm = esmImportRegex.exec(text)) !== null) {
				const varName = esm[1] || esm[2]
				const relPath = esm[3]
				const resolved = resolveFilePath(filePath, relPath, allFiles)
				if (resolved) {
					fileImports.set(varName, { targetFile: resolved, targetVar: esm[2] || 'default' })
				}
			}

			// Express Router definitions: const router = express.Router()
			const jsRouterRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:express\.)?Router\s*\(/g
			let jrm
			while ((jrm = jsRouterRegex.exec(text)) !== null) {
				fileRouters.set(jrm[1], '')
			}

			// Express mounts: app.use('/base', router) or apiRouter.use('/auth', authRouter)
			const useRegex = new RegExp("(\\w+)\\.use\\s*\\(\\s*['\"`]" + "([^'\"`]+)['\"`]" + "\\s*,\\s*([^,\\)]+)", "g")
			let um
			while ((um = useRegex.exec(text)) !== null) {
				const parentVar = um[1]
				const mountPrefix = um[2]
				const rawChild = um[3].trim()

				const inlineMatch = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(rawChild)
				if (inlineMatch) {
					const resolved = resolveFilePath(filePath, inlineMatch[1], allFiles)
					if (resolved) {
						mounts.push({
							parentFile: filePath,
							parentVar,
							mountPrefix,
							childFile: resolved,
							childVar: 'default',
						})
					}
				} else {
					const childVarName = rawChild.split('.')[0]
					const imp = fileImports.get(childVarName)
					if (imp) {
						mounts.push({
							parentFile: filePath,
							parentVar,
							mountPrefix,
							childFile: imp.targetFile,
							childVar: imp.targetVar,
						})
					} else {
						mounts.push({
							parentFile: filePath,
							parentVar,
							mountPrefix,
							childFile: filePath,
							childVar: childVarName,
						})
					}
				}
			}

			// Route registrations: (app|router).get('/path', ...)
			const jsRouteRegex = new RegExp("(\\w+)\\.(get|post|put|delete|patch|options|head|all)\\s*\\(\\s*['\"`]" + "([^'\"`]*)" + "['\"`]", "gi")
			let jr
			while ((jr = jsRouteRegex.exec(text)) !== null) {
				const receiver = jr[1]
				const method = jr[2].toUpperCase()
				const rPath = jr[3] || '/'
				const line = text.slice(0, jr.index).split(/\r?\n/).length
				const fullLine = text.split(/\r?\n/)[line - 1] || ''
				rawRoutes.push({
					file: filePath,
					line,
					method,
					path: rPath,
					snippet: formatSnippet(fullLine, 120),
					receiver,
				})
			}
		}
	}

	// Resolve effective prefixes
	const effectivePrefixMap = new Map()
	const graph = new Map()

	for (const m of mounts) {
		const parentKey = `${m.parentFile}::${m.parentVar}`
		if (!graph.has(parentKey)) graph.set(parentKey, [])
		const childKey = `${m.childFile}::${m.childVar}`
		graph.get(parentKey).push({ childKey, childFile: m.childFile, childVar: m.childVar, mountPrefix: m.mountPrefix })
	}

	const queue = []
	for (const [filePath] of filesMap.entries()) {
		queue.push({ key: `${filePath}::app`, prefix: '' })
	}

	const visited = new Set()
	while (queue.length > 0) {
		const { key, prefix } = queue.shift()
		if (visited.has(key)) continue
		visited.add(key)

		const children = graph.get(key) || []
		for (const ch of children) {
			const childRouters = routerDefs.get(ch.childFile)
			const internalPrefix = (childRouters && childRouters.get(ch.childVar)) || ''
			const combinedPrefix = joinRoutePaths(prefix, ch.mountPrefix, internalPrefix)

			effectivePrefixMap.set(ch.childKey, combinedPrefix)
			effectivePrefixMap.set(`${ch.childFile}::*`, combinedPrefix)

			queue.push({ key: ch.childKey, prefix: combinedPrefix })
		}
	}

	// Map raw routes to resolved routes
	const routes = []
	for (const r of rawRoutes) {
		let effPrefix = ''
		if (r.receiver && r.receiver.toLowerCase() !== 'app') {
			const key = `${r.file}::${r.receiver}`
			const fileKey = `${r.file}::*`
			const internalPrefix = routerDefs.get(r.file)?.get(r.receiver) || ''

			if (effectivePrefixMap.has(key)) {
				effPrefix = effectivePrefixMap.get(key)
			} else if (effectivePrefixMap.has(fileKey)) {
				effPrefix = joinRoutePaths(effectivePrefixMap.get(fileKey), internalPrefix)
			} else {
				effPrefix = internalPrefix
			}
		}

		const fullPath = joinRoutePaths(effPrefix, r.path)
		routes.push({
			method: r.method,
			path: fullPath,
			file: r.file,
			line: r.line,
			snippet: r.snippet,
		})
	}

	// Group routes by file
	const routesByFile = {}
	for (const r of routes) {
		if (!routesByFile[r.file]) {
			routesByFile[r.file] = []
		}
		routesByFile[r.file].push(r)
	}

	return { routes, routesByFile }
}

function extractProjectProfile({
	filesMap = new Map(),
	parsedPackageJsons = [],
	nodes = [],
	isNonProductionFile = () => false,
}) {
	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0] || { content: {} }
	const p = rootPkg.content || {}
	const allDeps = {
		...(p.dependencies || {}),
		...(p.devDependencies || {}),
	}
	const scripts = p.scripts && typeof p.scripts === 'object' ? p.scripts : {}

	// 1. Detected stacks
	const stacks = new Set()
	const allFilePaths = Array.from(filesMap.keys())

	// Node
	if (
		filesMap.has('package.json') ||
		allFilePaths.some((f) => /\.[mc]?[jt]sx?$/.test(f))
	) {
		stacks.add('node')
	}
	// Express
	if (
		allDeps.express ||
		allFilePaths.some((f) => {
			if (!/\.[mc]?[jt]sx?$|\.vue$/.test(f) || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]express['"]\s*\)|from\s+['"]express['"]/.test(text)
		})
	) {
		stacks.add('express')
	}
	// React
	if (
		allDeps.react ||
		allFilePaths.some((f) => !isNonProductionFile(f) && (/\.jsx$|\.tsx$/.test(f) || (filesMap.get(f)?.text?.includes("from 'react'") || filesMap.get(f)?.text?.includes('from "react"'))))
	) {
		stacks.add('react')
	}
	// Vite
	if (
		allDeps.vite ||
		allFilePaths.some((f) => f.includes('vite.config.'))
	) {
		stacks.add('vite')
	}
	// Python
	if (
		filesMap.has('requirements.txt') ||
		filesMap.has('pyproject.toml') ||
		filesMap.has('Pipfile') ||
		allFilePaths.some((f) => !isNonProductionFile(f) && f.endsWith('.py'))
	) {
		stacks.add('python')
	}
	// Django
	if (
		filesMap.has('manage.py') ||
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\bimport\s+django\b|\bfrom\s+django\b/.test(text)
		})
	) {
		stacks.add('django')
		stacks.add('python')
	}
	// Flask
	if (
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\bimport\s+flask\b|\bfrom\s+flask\b/.test(text)
		})
	) {
		stacks.add('flask')
		stacks.add('python')
	}
	// FastAPI
	if (
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\bimport\s+fastapi\b|\bfrom\s+fastapi\b/.test(text)
		})
	) {
		stacks.add('fastapi')
		stacks.add('python')
	}
	// Docker
	if (
		filesMap.has('Dockerfile') ||
		filesMap.has('docker-compose.yml') ||
		filesMap.has('docker-compose.yaml') ||
		filesMap.has('compose.yaml') ||
		filesMap.has('compose.yml')
	) {
		stacks.add('docker')
	}

	// 2. Test framework
	let testFramework = null
	if (allDeps.vitest) testFramework = 'vitest'
	else if (allDeps.jest) testFramework = 'jest'
	else if (allDeps.mocha) testFramework = 'mocha'
	else if (allDeps.ava) testFramework = 'ava'
	else if (allDeps['@playwright/test']) testFramework = 'playwright'
	else if (allDeps.cypress) testFramework = 'cypress'
	else if (scripts.test && scripts.test.includes('node --test')) testFramework = 'node:test'
	else if (stacks.has('python')) {
		if (filesMap.get('requirements.txt')?.text?.includes('pytest')) testFramework = 'pytest'
		else testFramework = 'unittest'
	}

	// 3. CI provider
	let ciProvider = null
	if (allFilePaths.some((f) => f.startsWith('.github/workflows/'))) {
		ciProvider = 'github-actions'
	} else if (filesMap.has('.gitlab-ci.yml')) {
		ciProvider = 'gitlab-ci'
	} else if (allFilePaths.some((f) => f.startsWith('.circleci/'))) {
		ciProvider = 'circleci'
	} else if (filesMap.has('.travis.yml')) {
		ciProvider = 'travis'
	} else if (filesMap.has('azure-pipelines.yml')) {
		ciProvider = 'azure-devops'
	}

	// 4. Node version sources
	const nvmrc = filesMap.get('.nvmrc')?.text?.trim() || null
	const engines = p.engines && typeof p.engines === 'object' && p.engines.node ? p.engines.node : null
	let ciNodeVersion = null
	for (const f of allFilePaths) {
		if (f.startsWith('.github/workflows/') && filesMap.get(f)?.text) {
			const ciText = filesMap.get(f).text
			const match = ciText.match(/node-version:\s*(?:\[([^\]]+)\]|['"]?([^'"\r\n]+)['"]?)/)
			if (match) {
				ciNodeVersion = (match[1] || match[2] || '').trim()
				break
			}
		}
	}
	const nodeVersionSources = {
		nvmrc,
		engines,
		ci: ciNodeVersion,
	}

	// 5. Entry points
	const entryPoints = nodes
		.filter((n) => n.category === 'production' && n.isEntry)
		.map((n) => n.path)

	// 6. Routes found
	const { routes, routesByFile } = extractProjectRoutes(filesMap, isNonProductionFile)

	// 7. Env vars read in code
	const envVarsSet = new Set()
	const envMap = {}
	const processEnvRegex = /process\.env\.([A-Za-z0-9_]+)/g
	const importMetaEnvRegex = /import\.meta\.env\.([A-Za-z0-9_]+)/g
	const osEnvironRegex = /os\.environ(?:\.get\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)|\s*\[\s*['"]([A-Za-z0-9_]+)['"]\s*\])/g

	for (const [filePath, fileData] of filesMap.entries()) {
		if (isNonProductionFile(filePath) || !fileData.text) continue
		const text = fileData.text
		let m
		while ((m = processEnvRegex.exec(text)) !== null) {
			const name = m[1]
			envVarsSet.add(name)
			if (!envMap[name]) envMap[name] = []
			if (!envMap[name].includes(filePath)) envMap[name].push(filePath)
		}
		while ((m = importMetaEnvRegex.exec(text)) !== null) {
			const name = m[1]
			envVarsSet.add(name)
			if (!envMap[name]) envMap[name] = []
			if (!envMap[name].includes(filePath)) envMap[name].push(filePath)
		}
		while ((m = osEnvironRegex.exec(text)) !== null) {
			const name = m[1] || m[2]
			if (name) {
				envVarsSet.add(name)
				if (!envMap[name]) envMap[name] = []
				if (!envMap[name].includes(filePath)) envMap[name].push(filePath)
			}
		}
	}

	const envVars = Array.from(envVarsSet).sort()

	return {
		stacks: Array.from(stacks),
		scripts,
		packageScripts: scripts,
		entryPoints,
		testFramework,
		ciProvider,
		nodeVersionSources,
		routes,
		routesByFile,
		envVars,
		envMap,
	}
}

/**
 * Universal rules, Node/Express, React/Vite, Python, and OSV vulnerability rules.
 */
function evaluateProjectRules({
	filesMap = new Map(),
	parsedPackageJsons = [],
	nodes = [],
	profile = {},
	isNonProductionFile = () => false,
	options = {},
}) {
	const findings = []
	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0] || { content: {} }
	const p = rootPkg.content || {}
	const allFilePaths = Array.from(filesMap.keys())
	const allDeps = {}
	for (const pkg of parsedPackageJsons) {
		Object.assign(allDeps, pkg.content?.dependencies || {}, pkg.content?.devDependencies || {})
	}
	Object.assign(allDeps, p.dependencies || {}, p.devDependencies || {})
	const prodNodes = nodes.filter((n) => n.category === 'production' && !isNonProductionFile(n.path))

	// Helper to find line & masked snippet for secrets
	function findSecretEvidence(fileText, rawSecret) {
		const lines = fileText.split(/\r?\n/)
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(rawSecret)) {
				const maskedLine = lines[i].replace(rawSecret, maskSecret(rawSecret))
				return {
					line: i + 1,
					snippet: formatSnippet(maskedLine, 120),
				}
			}
		}
		return { line: 1, snippet: maskSecret(rawSecret) }
	}

	// 1. Universal: Committed Secrets
	const secretOccurrences = []
	for (const [filePath, fileData] of filesMap.entries()) {
		if (isNonProductionFile(filePath) || !fileData.text) continue
		const text = fileData.text

		for (const pat of SECRET_PATTERNS) {
			let m
			const r = new RegExp(pat.regex.source, pat.regex.flags)
			while ((m = r.exec(text)) !== null) {
				const raw = m[1] || m[0]
				if (raw && !PLACEHOLDER_SECRET_TEST.test(raw)) {
					const ev = findSecretEvidence(text, raw)
					secretOccurrences.push({
						file: filePath,
						line: ev.line,
						snippet: ev.snippet,
						masked: maskSecret(raw),
						type: pat.name,
					})
				}
			}
		}
	}

	findings.push(
		createRuleResult({
			id: 'committed-secrets',
			name: 'Committed Secret or Credential',
			severity: 'critical',
			dimension: 'security',
			why:
				secretOccurrences.length > 0
					? `Committed secret (${secretOccurrences[0].masked}) detected in production file "${secretOccurrences[0].file}".`
					: 'No committed secrets found. Good.',
			fix:
				secretOccurrences.length > 0
					? `Revoke this credential immediately, remove it from "${secretOccurrences[0].file}", and store it in an environment variable.`
					: 'No action required.',
			docsUrl: 'https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password',
			evidence: secretOccurrences,
			count: secretOccurrences.length,
		})
	)

	// 2. Universal: .env tracked by git
	const trackedEnvFiles = allFilePaths.filter((f) => {
		if (isNonProductionFile(f)) return false
		const base = path.posix.basename(f).toLowerCase()
		if (base === '.env' || base.startsWith('.env.')) {
			if (base === '.env.example' || base === '.env.sample' || base === '.env.template') {
				return false
			}
			return true
		}
		return false
	})
	const envTrackedEvidence = trackedEnvFiles.slice(0, 3).map((f) => ({
		file: f,
		line: 1,
		snippet: f,
	}))

	findings.push(
		createRuleResult({
			id: 'env-file-tracked',
			name: 'Environment File Tracked in Git',
			severity: 'critical',
			dimension: 'security',
			why:
				trackedEnvFiles.length > 0
					? `Environment file "${trackedEnvFiles[0]}" is committed to version control.`
					: 'No sensitive .env files committed to repository.',
			fix:
				trackedEnvFiles.length > 0
					? `Remove "${trackedEnvFiles[0]}" from git tracking and add it to .gitignore.`
					: 'No action required.',
			docsUrl: 'https://12factor.net/config',
			evidence: envTrackedEvidence,
			count: trackedEnvFiles.length,
		})
	)

	// Helper to check if a file exists in filesMap, inventory, or options
	function hasFile(name) {
		const target = name.toLowerCase()
		for (const k of filesMap.keys()) {
			const kLower = k.toLowerCase()
			if (kLower === target || kLower.endsWith('/' + target)) return true
		}
		const inv = options?.inventory?.allFiles || options?.inventory?.largest || options?.allFiles || []
		for (const item of inv) {
			const p = typeof item === 'string' ? item : item?.path
			if (p) {
				const pLower = p.toLowerCase()
				if (pLower === target || pLower.endsWith('/' + target)) return true
			}
		}
		return false
	}

	// 3. Universal: Missing lockfile
	// Accept package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock, and Cargo/poetry/Pipfile locks for their stacks
	const hasPackageJson = hasFile('package.json')
	const hasNodeLock =
		hasFile('package-lock.json') ||
		hasFile('yarn.lock') ||
		hasFile('pnpm-lock.yaml') ||
		hasFile('bun.lockb') ||
		hasFile('bun.lock')

	const hasCargo = hasFile('Cargo.toml')
	const hasCargoLock = hasFile('Cargo.lock')

	const hasPipfile = hasFile('Pipfile')
	const hasPipfileLock = hasFile('Pipfile.lock')

	const hasPoetry =
		hasFile('poetry.lock') ||
		(hasFile('pyproject.toml') && (filesMap.get('pyproject.toml')?.text || '').includes('tool.poetry'))
	const hasPoetryLock = hasFile('poetry.lock')

	let missingLockfile = false
	let missingWhy = 'Package lockfile is present and tracked.'
	let missingFix = 'No action required.'
	let missingEvidence = []

	if (hasPackageJson && !hasNodeLock && allFilePaths.length >= 4) {
		missingLockfile = true
		missingWhy = 'No package lockfile was found in the repository root alongside package.json.'
		missingFix = 'Generate and commit package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lock.'
		missingEvidence = [{ file: 'package.json', line: 1, snippet: 'Missing lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lock)' }]
	} else if (hasCargo && !hasCargoLock && allFilePaths.length >= 4) {
		missingLockfile = true
		missingWhy = 'No Cargo.lock was found alongside Cargo.toml.'
		missingFix = 'Generate and commit Cargo.lock.'
		missingEvidence = [{ file: 'Cargo.toml', line: 1, snippet: 'Missing Cargo.lock' }]
	} else if (hasPipfile && !hasPipfileLock && allFilePaths.length >= 4) {
		missingLockfile = true
		missingWhy = 'No Pipfile.lock was found alongside Pipfile.'
		missingFix = 'Generate and commit Pipfile.lock.'
		missingEvidence = [{ file: 'Pipfile', line: 1, snippet: 'Missing Pipfile.lock' }]
	} else if (hasPoetry && !hasPoetryLock && allFilePaths.length >= 4) {
		missingLockfile = true
		missingWhy = 'No poetry.lock was found alongside pyproject.toml.'
		missingFix = 'Generate and commit poetry.lock.'
		missingEvidence = [{ file: 'pyproject.toml', line: 1, snippet: 'Missing poetry.lock' }]
	}

	findings.push(
		createRuleResult({
			id: 'missing-lockfile',
			name: 'Missing Package Lockfile',
			severity: 'important',
			dimension: 'hygiene',
			why: missingWhy,
			fix: missingFix,
			docsUrl: 'https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json',
			evidence: missingEvidence,
			count: missingLockfile ? 1 : 0,
		})
	)

	// 4. Universal: Node version mismatch across sources
	function parseMajor(v) {
		if (!v || typeof v !== 'string') return null
		const m = v.match(/\b(\d+)\b/)
		return m ? parseInt(m[1], 10) : null
	}
	const nvmrcMajor = parseMajor(profile.nodeVersionSources?.nvmrc)
	const enginesMajor = parseMajor(profile.nodeVersionSources?.engines)
	const ciMajor = parseMajor(profile.nodeVersionSources?.ci)

	const presentMajors = [
		{ src: '.nvmrc', major: nvmrcMajor, raw: profile.nodeVersionSources?.nvmrc },
		{ src: 'engines.node', major: enginesMajor, raw: profile.nodeVersionSources?.engines },
		{ src: 'CI workflow', major: ciMajor, raw: profile.nodeVersionSources?.ci },
	].filter((x) => x.major !== null)

	let hasMismatch = false
	if (presentMajors.length >= 2) {
		const first = presentMajors[0].major
		if (presentMajors.some((x) => x.major !== first)) {
			hasMismatch = true
		}
	}
	const mismatchCount = hasMismatch ? 1 : 0
	const mismatchDesc = presentMajors.map((x) => `${x.src} (${x.raw})`).join(', ')

	findings.push(
		createRuleResult({
			id: 'node-version-mismatch',
			name: 'Node Version Mismatch Across Sources',
			severity: 'important',
			dimension: 'reliability',
			why:
				hasMismatch
					? `Node version mismatch detected between ${mismatchDesc}.`
					: 'Node version declarations are consistent across configuration files.',
			fix:
				hasMismatch
					? 'Align Node.js major versions across .nvmrc, package.json engines, and CI workflows.'
					: 'No action required.',
			docsUrl: 'https://nodejs.org/en/about/previous-releases',
			evidence: hasMismatch ? [{ file: '.nvmrc', line: 1, snippet: mismatchDesc }] : [],
			count: mismatchCount,
		})
	)

	// 5. Universal: No CI
	const hasCi = Boolean(profile.ciProvider)
	const noCiCount = hasCi || allFilePaths.length < 4 ? 0 : 1

	findings.push(
		createRuleResult({
			id: 'no-ci',
			name: 'Missing Continuous Integration Configuration',
			severity: 'nice-to-have',
			dimension: 'hygiene',
			why:
				noCiCount > 0
					? 'No continuous integration (CI) workflow is configured for this repository.'
					: 'Continuous integration (CI) workflow is configured.',
			fix:
				noCiCount > 0
					? 'Add a GitHub Actions workflow in .github/workflows/ci.yml to automate build and test checks.'
					: 'No action required.',
			docsUrl: 'https://docs.github.com/en/actions',
			evidence: noCiCount > 0 ? [{ file: '.github/workflows', line: 1, snippet: 'No workflow files found' }] : [],
			count: noCiCount,
		})
	)

	// 6. Universal: No test script
	const testScript = p.scripts?.test
	const hasTestScript =
		typeof testScript === 'string' &&
		testScript.trim() !== '' &&
		!testScript.includes('no test specified')
	const noTestScriptCount = hasPackageJson && !hasTestScript ? 1 : 0

	findings.push(
		createRuleResult({
			id: 'no-test-script',
			name: 'No Test Script in package.json',
			severity: 'important',
			dimension: 'maintainability',
			why:
				noTestScriptCount > 0
					? 'package.json does not define a runnable "test" script.'
					: 'package.json defines a test script.',
			fix:
				noTestScriptCount > 0
					? 'Add a "test" script in package.json (e.g. "test": "vitest run").'
					: 'No action required.',
			docsUrl: 'https://docs.npmjs.com/cli/v10/using-npm/scripts',
			evidence: noTestScriptCount > 0 ? [{ file: 'package.json', line: 1, snippet: 'Missing test script' }] : [],
			count: noTestScriptCount,
		})
	)

	// 7. Universal: Low test-to-source ratio
	const testFiles = allFilePaths.filter((f) => {
		const lower = f.toLowerCase()
		return lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__/')
	})
	const prodFiles = allFilePaths.filter((f) => !isNonProductionFile(f) && /\.[mc]?[jt]sx?$|\.py$/.test(f))
	const ratio = prodFiles.length > 0 ? testFiles.length / prodFiles.length : 1
	const lowRatio = prodFiles.length >= 5 && ratio < 0.1
	const lowRatioCount = lowRatio ? 1 : 0

	findings.push(
		createRuleResult({
			id: 'low-test-ratio',
			name: 'Low Test-to-Source File Ratio',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why:
				lowRatio
					? `Low test-to-source ratio: found ${testFiles.length} test ${testFiles.length === 1 ? 'file' : 'files'} for ${prodFiles.length} production files (${(ratio * 100).toFixed(0)}%).`
					: 'Test-to-source file ratio is adequate.',
			fix:
				lowRatio
					? 'Add automated tests for core production modules.'
					: 'No action required.',
			docsUrl: 'https://martinfowler.com/bliki/TestPyramid.html',
			evidence: lowRatio ? [{ file: prodFiles[0] || 'src', line: 1, snippet: `${testFiles.length} test files vs ${prodFiles.length} source files` }] : [],
			count: lowRatioCount,
		})
	)

	// 8. Universal: Files over 800 lines
	const largeFiles = []
	const largeFilePkgs = new Set()
	for (const [filePath, fileData] of filesMap.entries()) {
		if (isNonProductionFile(filePath) || !fileData.text) continue
		if (!/\.[mc]?[jt]sx?$|\.py$/.test(filePath)) continue
		const lines = fileData.text.split(/\r?\n/)
		if (lines.length > 800) {
			largeFiles.push({
				file: filePath,
				line: 1,
				snippet: `${lines.length} lines`,
				lineCount: lines.length,
			})
			const pkg = getNearestPkg(filePath, parsedPackageJsons)
			largeFilePkgs.add(pkg?.path || 'package.json')
		}
	}

	findings.push(
		createRuleResult({
			id: 'file-over-800-lines',
			name: 'File Exceeds 800 Lines',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why:
				largeFiles.length > 0
					? `Production file "${largeFiles[0].file}" has ${largeFiles[0].lineCount} lines, exceeding 800 lines.`
					: 'No production source files exceed 800 lines.',
			fix:
				largeFiles.length > 0
					? `Refactor "${largeFiles[0].file}" by breaking it down into smaller focused modules.`
					: 'No action required.',
			docsUrl: 'https://refactoring.guru/smells/large-class',
			evidence: largeFiles,
			count: largeFilePkgs.size,
		})
	)

	// 9. Universal: Env var used in code but missing from .env.example
	// 10. Universal: .env.example var never used
	const envExampleText = filesMap.get('.env.example')?.text || ''
	const hasEnvExample = Boolean(filesMap.has('.env.example'))
	const exampleVars = new Set()
	if (hasEnvExample) {
		const lines = envExampleText.split(/\r?\n/)
		for (const line of lines) {
			const clean = line.trim()
			if (!clean || clean.startsWith('#')) continue
			const match = clean.match(/^([A-Za-z0-9_]+)\s*=/)
			if (match) {
				exampleVars.add(match[1])
			}
		}
	}

	const missingFromExample = []
	if (hasEnvExample) {
		for (const varName of profile.envVars || []) {
			if (!exampleVars.has(varName)) {
				const srcFile = profile.envMap?.[varName]?.[0] || 'src'
				const info = findLineAndSnippet(filesMap.get(srcFile)?.text, varName)
				missingFromExample.push({
					varName,
					file: srcFile,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}
	}

	findings.push(
		createRuleResult({
			id: 'env-missing-from-example',
			name: 'Environment Variable Missing from .env.example',
			severity: 'important',
			dimension: 'hygiene',
			why:
				missingFromExample.length > 0
					? `Environment variable "${missingFromExample[0].varName}" is used in "${missingFromExample[0].file}" but missing from .env.example.`
					: 'All referenced environment variables are documented in .env.example.',
			fix:
				missingFromExample.length > 0
					? `Add "${missingFromExample[0].varName}=" to .env.example.`
					: 'No action required.',
			docsUrl: 'https://12factor.net/config',
			evidence: missingFromExample.map((x) => ({ file: x.file, line: x.line, snippet: x.snippet })),
			count: missingFromExample.length,
		})
	)

	const unusedExampleVars = []
	if (hasEnvExample) {
		const usedEnvSet = new Set(profile.envVars || [])
		for (const varName of exampleVars) {
			if (!usedEnvSet.has(varName)) {
				const info = findLineAndSnippet(envExampleText, varName)
				unusedExampleVars.push({
					varName,
					file: '.env.example',
					line: info.line,
					snippet: info.snippet,
				})
			}
		}
	}

	findings.push(
		createRuleResult({
			id: 'unused-example-env',
			name: 'Unused Variable in .env.example',
			severity: 'nice-to-have',
			dimension: 'hygiene',
			why:
				unusedExampleVars.length > 0
					? `Variable "${unusedExampleVars[0].varName}" is defined in .env.example but never read in code.`
					: 'All variables in .env.example are used in the codebase.',
			fix:
				unusedExampleVars.length > 0
					? `Remove "${unusedExampleVars[0].varName}" from .env.example if it is obsolete.`
					: 'No action required.',
			docsUrl: 'https://12factor.net/config',
			evidence: unusedExampleVars.map((x) => ({ file: x.file, line: x.line, snippet: x.snippet })),
			count: unusedExampleVars.length,
		})
	)

	// Node/Express Rules
	const isExpress = profile.stacks?.includes('express')
	if (isExpress) {
		// 11. No error-handling middleware
		let hasErrorMiddleware = false
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			// 4 parameters: (err, req, res, next)
			if (
				/\.use\s*\(\s*(?:async\s*)?\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i.test(fileData.text) ||
				/function\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i.test(fileData.text) ||
				/function\s+\w+\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i.test(fileData.text)
			) {
				hasErrorMiddleware = true
				break
			}
		}
		const noErrorMidCount = hasErrorMiddleware ? 0 : 1

		findings.push(
			createRuleResult({
				id: 'express-no-error-middleware',
				name: 'No Error-Handling Middleware in Express',
				severity: 'important',
				dimension: 'reliability',
				why:
					noErrorMidCount > 0
						? 'Express app has no 4-argument error-handling middleware registered.'
						: 'Express application registers error-handling middleware.',
				fix:
					noErrorMidCount > 0
						? 'Add a global error-handling middleware: `app.use((err, req, res, next) => { ... })`.'
						: 'No action required.',
				docsUrl: 'https://expressjs.com/en/guide/error-handling.html',
				evidence: noErrorMidCount > 0 ? [{ file: 'src/server.js', line: 1, snippet: 'Missing error handler' }] : [],
				count: noErrorMidCount,
			})
		)

		// 12. No helmet
		let hasHelmet = Boolean(allDeps.helmet)
		if (hasHelmet) {
			hasHelmet = allFilePaths.some((f) => {
				const text = filesMap.get(f)?.text || ''
				return text.includes('helmet()') || text.includes('helmet(')
			})
		}
		const noHelmetCount = hasHelmet ? 0 : 1

		findings.push(
			createRuleResult({
				id: 'express-no-helmet',
				name: 'Missing Helmet Security Headers',
				severity: 'important',
				dimension: 'security',
				why:
					noHelmetCount > 0
						? 'Express app does not use helmet to configure secure HTTP response headers.'
						: 'Helmet middleware is used to configure security headers.',
				fix:
					noHelmetCount > 0
						? 'Install helmet (`npm install helmet`) and add `app.use(helmet())`.'
						: 'No action required.',
				docsUrl: 'https://helmetjs.github.io/',
				evidence: noHelmetCount > 0 ? [{ file: 'package.json', line: 1, snippet: 'Missing helmet dependency' }] : [],
				count: noHelmetCount,
			})
		)

		// 13. Wildcard CORS
		// Only fire for cors() with no options, origin: '*', origin: true, or an allowedOrigins/array that contains '*'. Resolve variable if defined in the same file.
		function resolveVariableContainsWildcard(text, varName, seen = new Set()) {
			if (!varName || seen.has(varName)) return false
			seen.add(varName)
			const declRegex = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*([^;\\n]+)`, 'g')
			let m
			while ((m = declRegex.exec(text)) !== null) {
				const expr = m[1].trim()
				if (/['"]\*['"]/.test(expr) || expr === 'true') return true
				const idents = expr.match(/[A-Za-z0-9_$]+/g) || []
				for (const id of idents) {
					if (id !== varName && !seen.has(id)) {
						if (resolveVariableContainsWildcard(text, id, seen)) return true
					}
				}
			}
			return false
		}

		function checkWildcardCorsInFile(text) {
			const hasCorsImport = /\b(require\s*\(\s*['"]cors['"]|from\s*['"]cors['"])/.test(text)
			const hasHeader = /Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]/i.test(text)
			if (!hasCorsImport && !hasHeader) return null

			const lines = text.split(/\r?\n/)
			// Check direct response headers
			for (let i = 0; i < lines.length; i++) {
				const l = lines[i]
				if (/Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]/i.test(l)) {
					return { line: i + 1, snippet: formatSnippet(l, 120) }
				}
			}

			// Check cors(...)
			const corsRegex = /\bcors\s*\(([^)]*)\)/g
			let match
			while ((match = corsRegex.exec(text)) !== null) {
				const args = match[1].trim()
				const upToMatch = text.slice(0, match.index)
				const lineNum = upToMatch.split(/\r?\n/).length
				const lineText = lines[lineNum - 1] || match[0]

				if (/^\s*\/\//.test(lineText) || /^\s*\*/.test(lineText) || /^\s*const\s+\w+Regex\s*=/.test(lineText)) {
					continue
				}

				// cors() or cors({})
				if (!args || args === '' || args === '{}') {
					return { line: lineNum, snippet: formatSnippet(lineText, 120) }
				}

				// origin: '*' or origin: "*"
				if (/origin\s*:\s*['"]\*['"]/.test(args)) {
					return { line: lineNum, snippet: formatSnippet(lineText, 120) }
				}

				// origin: true
				if (/origin\s*:\s*true\b/.test(args)) {
					return { line: lineNum, snippet: formatSnippet(lineText, 120) }
				}

				// origin: ['*', ...]
				const arrMatch = args.match(/origin\s*:\s*\[([^\]]*)\]/)
				if (arrMatch && /['"]\*['"]/.test(arrMatch[1])) {
					return { line: lineNum, snippet: formatSnippet(lineText, 120) }
				}

				// origin: varName
				const identMatch = args.match(/origin\s*:\s*([A-Za-z0-9_$]+)/)
				if (identMatch) {
					const varName = identMatch[1]
					if (resolveVariableContainsWildcard(text, varName)) {
						return { line: lineNum, snippet: formatSnippet(lineText, 120) }
					}
				}
			}
			return null
		}

		const wildcardCorsEvidence = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\.[mc]?[jt]sx?$|\.vue$/.test(filePath)) continue
			const corsFinding = checkWildcardCorsInFile(fileData.text)
			if (corsFinding) {
				wildcardCorsEvidence.push({
					file: filePath,
					line: corsFinding.line,
					snippet: corsFinding.snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-wildcard-cors',
				name: 'Wildcard CORS Origin Allowed',
				severity: 'important',
				dimension: 'security',
				why:
					wildcardCorsEvidence.length > 0
						? `Wildcard CORS origin configured in "${wildcardCorsEvidence[0].file}", permitting requests from any origin.`
						: 'CORS origins are properly restricted.',
				fix:
					wildcardCorsEvidence.length > 0
						? `Restrict CORS origin to trusted domains in "${wildcardCorsEvidence[0].file}".`
						: 'No action required.',
				docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
				evidence: wildcardCorsEvidence,
				count: wildcardCorsEvidence.length,
			})
		)

		// 14. Route handlers with no input validation
		const unvalidatedRoutes = []
		const unvalidatedPkgs = new Set()
		const hasValidationLib =
			Boolean(allDeps.zod) ||
			Boolean(allDeps.joi) ||
			Boolean(allDeps.yup) ||
			Boolean(allDeps['express-validator']) ||
			Boolean(allDeps.celebrate)

		if (!hasValidationLib) {
			for (const r of profile.routes || []) {
				const fileText = filesMap.get(r.file)?.text || ''
				const hasValidationHelper =
					/\b(validate\w*|schema\w*|parse\w*|sanitize\w*|assert\w*|check\w*)\b/i.test(fileText) ||
					/\b(validate|schema|parse|check|assert|sanitize)\s*\(/i.test(fileText)
				if (
					(fileText.includes('req.body') || fileText.includes('req.query') || fileText.includes('req.params')) &&
					!hasValidationHelper
				) {
					unvalidatedRoutes.push({
						file: r.file,
						line: r.line || 1,
						snippet: r.snippet || `Route ${r.method} ${r.path}`,
						path: r.path,
					})
					const pkg = getNearestPkg(r.file, parsedPackageJsons)
					unvalidatedPkgs.add(pkg?.path || 'package.json')
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-unvalidated-inputs',
				name: 'Route Handler Without Input Validation',
				severity: 'important',
				dimension: 'security',
				why:
					unvalidatedRoutes.length > 0
						? `Route handler for "${unvalidatedRoutes[0].path}" in "${unvalidatedRoutes[0].file}" parses inputs without schema validation.`
						: 'Route handlers validate input parameters.',
				fix:
					unvalidatedRoutes.length > 0
						? `Validate request parameters and body using Zod, Joi, or express-validator in "${unvalidatedRoutes[0].file}".`
						: 'No action required.',
				docsUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
				evidence: unvalidatedRoutes,
				count: unvalidatedRoutes.length,
			})
		)

		// 15. Simple low-false-positive unhandled-promise patterns
		const unhandledPromiseList = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			const lines = text.split(/\r?\n/)
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim()
				if (line.startsWith('//') || line.startsWith('*')) continue
				// Floating new Promise without catch/return/assignment
				if (/^new\s+Promise\s*\(/.test(line) && !line.includes('.catch(')) {
					unhandledPromiseList.push({
						file: filePath,
						line: i + 1,
						snippet: formatSnippet(line, 120),
					})
				} else if (/\.then\s*\([^)]+\)\s*;?\s*$/.test(line) && !line.includes('.catch(') && !line.startsWith('return ') && !line.startsWith('const ') && !line.startsWith('let ') && !line.startsWith('var ')) {
					unhandledPromiseList.push({
						file: filePath,
						line: i + 1,
						snippet: formatSnippet(line, 120),
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'unhandled-promise',
				name: 'Unhandled Promise in Async Code',
				severity: 'important',
				dimension: 'reliability',
				why:
					unhandledPromiseList.length > 0
						? `Uncaught Promise created in "${unhandledPromiseList[0].file}" without an attached .catch() handler.`
						: 'Promises and asynchronous operations handle rejections.',
				fix:
					unhandledPromiseList.length > 0
						? `Attach a .catch() handler or await the promise inside a try/catch block in "${unhandledPromiseList[0].file}".`
						: 'No action required.',
				docsUrl: 'https://nodejs.org/api/process.html#event-unhandledrejection',
				evidence: unhandledPromiseList,
				count: unhandledPromiseList.length,
			})
		)
	} else {
		// Push inactive Express rules
		findings.push(createRuleResult({
			id: 'express-no-error-middleware',
			name: 'No Error-Handling Middleware in Express',
			severity: 'important',
			dimension: 'reliability',
			why: 'Project does not use Express.',
			fix: 'No action required.',
			docsUrl: 'https://expressjs.com/en/guide/error-handling.html',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'express-no-helmet',
			name: 'Missing Helmet Security Headers',
			severity: 'important',
			dimension: 'security',
			why: 'Project does not use Express.',
			fix: 'No action required.',
			docsUrl: 'https://helmetjs.github.io/',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'express-wildcard-cors',
			name: 'Wildcard CORS Origin Allowed',
			severity: 'important',
			dimension: 'security',
			why: 'Project does not use Express.',
			fix: 'No action required.',
			docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'express-unvalidated-inputs',
			name: 'Route Handler Without Input Validation',
			severity: 'important',
			dimension: 'security',
			why: 'Project does not use Express.',
			fix: 'No action required.',
			docsUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'unhandled-promise',
			name: 'Unhandled Promise in Async Code',
			severity: 'important',
			dimension: 'reliability',
			why: 'No unhandled promises detected.',
			fix: 'No action required.',
			docsUrl: 'https://nodejs.org/api/process.html#event-unhandledrejection',
			count: 0,
		}))
	}

	// React and Vite Rules
	const isReact = profile.stacks?.includes('react')
	const isVite = profile.stacks?.includes('vite')

	// 16. Secrets in VITE_ variables (Vite rule)
	if (isVite) {
		const viteSecretFindings = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath)) continue
			if (!filePath.startsWith('.env') && !filePath.includes('src/')) continue
			const text = fileData.text || ''
			const viteMatch = text.match(/VITE_[A-Za-z0-9_]*(?:SECRET|PRIVATE|KEY|PASSWORD|TOKEN)[A-Za-z0-9_]*/gi)
			if (viteMatch) {
				for (const vm of viteMatch) {
					const info = findLineAndSnippet(text, vm)
					viteSecretFindings.push({
						file: filePath,
						line: info.line,
						snippet: info.snippet,
						varName: vm,
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'vite-secrets-in-env',
				name: 'Secret Exposed in Client-Side VITE_ Variable',
				severity: 'critical',
				dimension: 'security',
				why:
					viteSecretFindings.length > 0
						? `Potential secret exposed in client-accessible variable "${viteSecretFindings[0].varName}" in "${viteSecretFindings[0].file}".`
						: 'No client-side VITE_ variables expose private secrets.',
				fix:
					viteSecretFindings.length > 0
						? `Remove the "VITE_" prefix and keep "${viteSecretFindings[0].varName}" server-side.`
						: 'No action required.',
				docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
				evidence: viteSecretFindings,
				count: viteSecretFindings.length,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'vite-secrets-in-env',
			name: 'Secret Exposed in Client-Side VITE_ Variable',
			severity: 'critical',
			dimension: 'security',
			why: 'Project does not use Vite.',
			fix: 'No action required.',
			docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
			count: 0,
		}))
	}

	// 17. console.log in src (React or Vite)
	if (isReact || isVite) {
		const consoleLogFindings = []
		const consoleLogPkgs = new Set()
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (/\bconsole\.log\s*\(/.test(text)) {
				const info = findLineAndSnippet(text, 'console.log')
				consoleLogFindings.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
				const pkg = getNearestPkg(filePath, parsedPackageJsons)
				consoleLogPkgs.add(pkg?.path || 'package.json')
			}
		}

		findings.push(
			createRuleResult({
				id: 'console-log-in-src',
				name: 'console.log Left in Production Source',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					consoleLogFindings.length > 0
						? `console.log statement found in production file "${consoleLogFindings[0].file}".`
						: 'No residual console.log statements in src/.',
				fix:
					consoleLogFindings.length > 0
						? `Remove console.log from "${consoleLogFindings[0].file}".`
						: 'No action required.',
				docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
				evidence: consoleLogFindings,
				count: consoleLogPkgs.size,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'console-log-in-src',
			name: 'console.log Left in Production Source',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'No console.log statements found in src/.',
			fix: 'No action required.',
			docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
			count: 0,
		}))
	}

	// 18. Missing React Error Boundary (ONLY React projects)
	if (isReact) {
		let hasErrorBoundary = false
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (
				text.includes('componentDidCatch') ||
				text.includes('getDerivedStateFromError') ||
				text.includes('ErrorBoundary') ||
				text.includes('react-error-boundary')
			) {
				hasErrorBoundary = true
				break
			}
		}
		const noEbCount = hasErrorBoundary ? 0 : 1

		findings.push(
			createRuleResult({
				id: 'react-no-error-boundary',
				name: 'Missing React Error Boundary',
				severity: 'important',
				dimension: 'reliability',
				why:
					noEbCount > 0
						? 'No React Error Boundary detected to gracefully intercept rendering errors.'
						: 'React Error Boundary is implemented.',
				fix:
					noEbCount > 0
						? 'Add a React Error Boundary component (or use `react-error-boundary`) wrapping key application views.'
						: 'No action required.',
				docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
				evidence: noEbCount > 0 ? [{ file: 'src/App.jsx', line: 1, snippet: 'Missing ErrorBoundary component' }] : [],
				count: noEbCount,
			})
		)

		// 19. React Components over 400 lines (ONLY React projects)
		const largeComponents = []
		const largeComponentPkgs = new Set()
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\.[jt]sx$/.test(filePath)) continue
			const lines = fileData.text.split(/\r?\n/)
			if (lines.length > 400) {
				largeComponents.push({
					file: filePath,
					line: 1,
					snippet: `${lines.length} lines`,
					lineCount: lines.length,
				})
				const pkg = getNearestPkg(filePath, parsedPackageJsons)
				largeComponentPkgs.add(pkg?.path || 'package.json')
			}
		}

		findings.push(
			createRuleResult({
				id: 'react-component-over-400-lines',
				name: 'React Component Exceeds 400 Lines',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					largeComponents.length > 0
						? `React component "${largeComponents[0].file}" has ${largeComponents[0].lineCount} lines, exceeding 400 lines.`
						: 'No React component files exceed 400 lines.',
				fix:
					largeComponents.length > 0
						? `Extract subcomponents and custom hooks from "${largeComponents[0].file}".`
						: 'No action required.',
				docsUrl: 'https://react.dev/learn/thinking-in-react',
				evidence: largeComponents,
				count: largeComponentPkgs.size,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'react-no-error-boundary',
			name: 'Missing React Error Boundary',
			severity: 'important',
			dimension: 'reliability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'react-component-over-400-lines',
			name: 'React Component Exceeds 400 Lines',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/learn/thinking-in-react',
			count: 0,
		}))
	}

	// Python Rules
	const isPython = profile.stacks?.includes('python')
	if (isPython) {
		// 20. Unpinned requirements
		const unpinnedReqs = []
		const reqText = filesMap.get('requirements.txt')?.text
		if (reqText) {
			const lines = reqText.split(/\r?\n/)
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim()
				if (!line || line.startsWith('#') || line.startsWith('-')) continue
				if (!line.includes('==') && !line.includes('===')) {
					unpinnedReqs.push({
						file: 'requirements.txt',
						line: i + 1,
						snippet: formatSnippet(line),
						pkg: line.split(/[><=~!]/)[0].trim(),
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'python-unpinned-requirements',
				name: 'Unpinned Python Requirements',
				severity: 'important',
				dimension: 'hygiene',
				why:
					unpinnedReqs.length > 0
						? `Package "${unpinnedReqs[0].pkg}" in requirements.txt lacks exact version pinning.`
						: 'All requirements in requirements.txt are pinned.',
				fix:
					unpinnedReqs.length > 0
						? `Pin the version in requirements.txt (e.g. \`${unpinnedReqs[0].pkg}==1.0.0\`).`
						: 'No action required.',
				docsUrl: 'https://pip.pypa.io/en/stable/reference/requirements-file-format/',
				evidence: unpinnedReqs,
				count: unpinnedReqs.length,
			})
		)

		// 21. Bare except
		const bareExcepts = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !filePath.endsWith('.py') || !fileData.text) continue
			const text = fileData.text
			if (/^\s*except\s*:/m.test(text)) {
				const info = findLineAndSnippet(text, 'except:')
				bareExcepts.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'python-bare-except',
				name: 'Bare Exception Handler',
				severity: 'important',
				dimension: 'reliability',
				why:
					bareExcepts.length > 0
						? `Bare "except:" clause found in "${bareExcepts[0].file}".`
						: 'No bare except clauses found in Python code.',
				fix:
					bareExcepts.length > 0
						? `Specify the exception type to catch in "${bareExcepts[0].file}" (e.g. \`except Exception:\`).`
						: 'No action required.',
				docsUrl: 'https://peps.python.org/pep-0008/#programming-recommendations',
				evidence: bareExcepts,
				count: bareExcepts.length,
			})
		)

		// 22. debug=True
		const debugTrueFindings = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !filePath.endsWith('.py') || !fileData.text) continue
			const text = fileData.text
			if (/\bdebug\s*=\s*True\b/i.test(text) || /\bDEBUG\s*=\s*True\b/.test(text)) {
				const info = findLineAndSnippet(text, 'debug')
				debugTrueFindings.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'python-debug-true',
				name: 'Debug Mode Enabled in Python Code',
				severity: 'critical',
				dimension: 'security',
				why:
					debugTrueFindings.length > 0
						? `Debug mode enabled (\`debug=True\`) in "${debugTrueFindings[0].file}".`
						: 'Debug mode is disabled in production Python code.',
				fix:
					debugTrueFindings.length > 0
						? `Disable debug mode in "${debugTrueFindings[0].file}" or gate it behind an environment variable.`
						: 'No action required.',
				docsUrl: 'https://flask.palletsprojects.com/en/stable/quickstart/#debug-mode',
				evidence: debugTrueFindings,
				count: debugTrueFindings.length,
			})
		)


	} else {
		// Push inactive Python rules
		findings.push(createRuleResult({
			id: 'python-unpinned-requirements',
			name: 'Unpinned Python Requirements',
			severity: 'important',
			dimension: 'hygiene',
			why: 'Project does not use Python.',
			fix: 'No action required.',
			docsUrl: 'https://pip.pypa.io/en/stable/reference/requirements-file-format/',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'python-bare-except',
			name: 'Bare Exception Handler',
			severity: 'important',
			dimension: 'reliability',
			why: 'Project does not use Python.',
			fix: 'No action required.',
			docsUrl: 'https://peps.python.org/pep-0008/#programming-recommendations',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'python-debug-true',
			name: 'Debug Mode Enabled in Python Code',
			severity: 'critical',
			dimension: 'security',
			why: 'Project does not use Python.',
			fix: 'No action required.',
			docsUrl: 'https://flask.palletsprojects.com/en/stable/quickstart/#debug-mode',
			count: 0,
		}))

	}

	// 24. Known Vulnerabilities from OSV
	const lockfileText = filesMap.get('package-lock.json')?.text || filesMap.get('yarn.lock')?.text
	if (lockfileText) {
		const prodDeps = extractProductionDepsFromLockfile(lockfileText, p)
		let vulns = options.vulns
		if (!vulns) {
			vulns = getCachedOsvVulnerabilities(prodDeps)
			if (!vulns) {
				queryOsvVulnerabilities(prodDeps, options).catch(() => {})
				vulns = []
			}
		}
		const vulnEvidence = vulns.slice(0, 3).map((v) => ({
			file: 'package-lock.json',
			line: 1,
			snippet: `${v.package}@${v.version}: ${v.id} - ${formatSnippet(v.summary, 60)}`,
		}))

		const highestSeverity = vulns.some((v) => v.severity === 'critical')
			? 'critical'
			: vulns.some((v) => v.severity === 'important')
			? 'important'
			: 'nice-to-have'

		findings.push(
			createRuleResult({
				id: 'known-vulnerabilities',
				name: 'Known Dependency Vulnerability',
				severity: highestSeverity,
				dimension: 'security',
				why:
					vulns.length > 0
						? `Known vulnerability ${vulns[0].id} found in production package "${vulns[0].package}@${vulns[0].version}".`
						: 'No known vulnerabilities found in production dependencies.',
				fix:
					vulns.length > 0
						? `Upgrade "${vulns[0].package}" to a patched release.`
						: 'No action required.',
				docsUrl: vulns[0]?.docsUrl || 'https://osv.dev/',
				evidence: vulnEvidence,
				count: vulns.length,
				children: vulns.map((v) => ({
					package: v.package,
					version: v.version,
					id: v.id,
					severity: v.severity,
					summary: v.summary,
					docsUrl: v.docsUrl,
				})),
			})
		)
	}

	return findings
}


async function evaluateProjectRulesAsync(args = {}) {
	const { filesMap = new Map(), parsedPackageJsons = [], options = {} } = args
	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0] || { content: {} }
	const p = rootPkg.content || {}
	const lockfileText = filesMap.get('package-lock.json')?.text || filesMap.get('yarn.lock')?.text
	let vulns = options.vulns
	if (!vulns && lockfileText) {
		const prodDeps = extractProductionDepsFromLockfile(lockfileText, p)
		vulns = await queryOsvVulnerabilities(prodDeps, options)
	}
	return evaluateProjectRules({ ...args, options: { ...options, vulns } })
}

module.exports = {
	extractProjectProfile,
	extractProjectRoutes,
	joinRoutePaths,
	evaluateProjectRules,
	evaluateProjectRulesAsync,
	maskSecret,
	SECRET_PATTERNS,
}

