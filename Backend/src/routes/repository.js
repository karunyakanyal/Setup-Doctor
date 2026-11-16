const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { runDiagnostics } = require('../rules')
const { ghFetch, TIMEOUT_ERROR_MESSAGE } = require('../services/github')
const { fetchRepoArchive } = require('../services/archive')
const { buildGraph, getCachedGraph, getCachedGraphCaseInsensitive, setCachedGraph, getPreviousScan, setPreviousScan } = require('../services/graph')
const { evaluateGithubHygiene } = require('../services/githubHygiene')
const { extractProductionDepsFromLockfile, queryOsvVulnerabilities } = require('../services/osv')
const { parseRepository } = require('../../../shared/repository')
const {
	computeChangeImpact,
	fetchPullRequestChanges,
	fetchCompareChanges,
	getCachedChangeImpact,
	setCachedChangeImpact,
} = require('../services/changeImpact')

const router = express.Router()

const identifierPattern = /^[\w.-]{1,100}$/
const isValidIdentifier = (value) => typeof value === 'string' && identifierPattern.test(value)

const allowedFileNames = new Set([
	'package.json',
	'tsconfig.json',
	'README.md',
	'.gitignore',
	'.env.example',
	'eslint.config.js',
	'vite.config.js',
])


function generateBadgeSvg(grade = 'unknown') {
	const colors = {
		A: '#4c1',
		B: '#97ca00',
		C: '#dfb317',
		D: '#fe7d37',
		E: '#e05d44',
		F: '#e05d44',
	}
	const isNoAnalysis = !grade || grade === 'unknown' || grade === 'run an analysis first'
	const color = isNoAnalysis ? '#9f9f9f' : (colors[grade] || '#9f9f9f')
	const label = 'SetupDoctor'
	const value = isNoAnalysis ? 'run an analysis first' : `Grade ${grade}`

	const leftWidth = 78
	const rightWidth = isNoAnalysis ? 140 : 52
	const totalWidth = leftWidth + rightWidth
	const textLen = isNoAnalysis ? 1300 : 440
	const textX = (leftWidth + rightWidth / 2) * 10

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="400" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="680">${label}</text>
    <text x="400" y="140" transform="scale(.1)" fill="#fff" textLength="680">${label}</text>
    <text aria-hidden="true" x="${textX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${textLen}">${value}</text>
    <text x="${textX}" y="140" transform="scale(.1)" fill="#fff" textLength="${textLen}">${value}</text>
  </g>
</svg>`
}

async function handleBadge(req, res) {
	const { owner, repo } = req.params

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo)) {
		const svg = generateBadgeSvg('run an analysis first')
		res.setHeader('Content-Type', 'image/svg+xml')
		res.setHeader('Cache-Control', 'public, max-age=600')
		return res.status(400).send(svg)
	}

	const cached = getPreviousScan(owner, repo) ||
		getCachedGraphCaseInsensitive(owner, repo) ||
		getCachedGraph(owner, repo, 'main') ||
		getCachedGraph(owner, repo, 'master')

	const rawGrade = cached?.grade || cached?.summary?.grade || cached?.dimensions?.overallGrade || null
	const hasAnalysis = Boolean(rawGrade && rawGrade !== 'unknown' && rawGrade !== 'N/A')
	const grade = hasAnalysis ? rawGrade : null

	const svg = generateBadgeSvg(grade || 'run an analysis first')

	const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'http'
	const host = (typeof req.get === 'function' ? req.get('host') : req.headers?.host) || 'localhost:3000'
	const defaultBase = `${proto}://${host}`
	const rawBase = (process.env.PUBLIC_BASE_URL || defaultBase).trim()
	const baseUrl = (rawBase.startsWith('http://') || rawBase.startsWith('https://') ? rawBase : `https://${rawBase}`).replace(/\/+$/, '')
	const badgeUrl = `${baseUrl}/api/badge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
	const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
	const disclaimer = 'Note: The backend must be publicly reachable for this badge to render on GitHub.'
	const markdown = `[![SetupDoctor Grade](${badgeUrl})](${repoUrl})\n\n> ${disclaimer}`

	res.setHeader('Cache-Control', 'public, max-age=600')
	res.setHeader('X-Markdown-Snippet', markdown)

	if (req.headers.accept?.includes('application/json') || req.query?.format === 'json') {
		return res.json({
			success: true,
			grade: hasAnalysis ? grade : 'unknown',
			status: hasAnalysis ? `Grade ${grade}` : 'run an analysis first',
			message: hasAnalysis ? null : 'run an analysis first',
			markdown,
			svg,
		})
	}

	res.setHeader('Content-Type', 'image/svg+xml')
	return res.send(svg)
}

const handleTree = async (req, res, next) => {
	const { owner, repo, branch } = req.query

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
		)

		if (githubResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'Repository not found or private',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubTree = await githubResponse.json()

		return res.json({
			success: true,
			tree: githubTree.tree.map((item) => ({
				path: item.path,
				type: item.type,
			})),
		})
	} catch (error) {
		if (res?.writableEnded || error?.name === 'AbortError') {
			return
		}
		if (error && error.status) {
			return next(error)
		}
		const err = new Error(error?.message || 'Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

const handleFile = async (req, res, next) => {
	const { owner, repo, branch, path } = req.query

	if (!owner || !repo || !branch || !path) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, branch, and path are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	if (typeof path !== 'string' || path.includes('..')) {
		return res.status(403).json({
			success: false,
			message: 'Access to the requested file is forbidden',
		})
	}

	const fileName = path.split('/').pop()
	if (!allowedFileNames.has(fileName)) {
		return res.status(403).json({
			success: false,
			message: 'Access to the requested file is forbidden',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
		)

		if (githubResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'Repository not found or private',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubFile = await githubResponse.json()
		const content = Buffer.from(githubFile.content, 'base64').toString('utf8')

		return res.json({
			success: true,
			path,
			content,
		})
	} catch (error) {
		if (res?.writableEnded || error?.name === 'AbortError') {
			return
		}
		if (error && error.status) {
			return next(error)
		}
		const err = new Error(error?.message || 'Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

const handleDiagnose = async (req, res, next) => {
	const { owner, repo, branch } = req.body || {}

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	const overallTimeoutMs = req.diagnoseTimeout || req.timeout || req.body?.diagnoseTimeout || 40000
	const overallAbortController = new AbortController()
	const overallTimer = setTimeout(() => {
		const err = new Error(TIMEOUT_ERROR_MESSAGE)
		err.name = 'TimeoutError'
		err.status = 502
		overallAbortController.abort(err)
	}, overallTimeoutMs)
	const overallSignal = overallAbortController.signal

	let clientDisconnected = false
	const clientAbortController = new AbortController()

	const onClientDisconnect = () => {
		if (!res.headersSent && !res.writableEnded) {
			clientDisconnected = true
			clientAbortController.abort(new Error('Client disconnected'))
		}
	}

	if (req?.signal) {
		if (req.signal.aborted) {
			onClientDisconnect()
		} else {
			req.signal.addEventListener('abort', onClientDisconnect, { once: true })
		}
	}
	if (req && typeof req.on === 'function') {
		req.on('aborted', onClientDisconnect)
	}
	if (res && typeof res.on === 'function') {
		res.on('close', () => {
			if (!res.writableEnded) {
				onClientDisconnect()
			}
		})
	}

	let diagnoseSignal = overallSignal
	if (typeof AbortSignal.any === 'function') {
		diagnoseSignal = AbortSignal.any([overallSignal, clientAbortController.signal])
	}

	const fetchOptions = {
		signal: diagnoseSignal,
	}
	if (req.fetchFn) {
		fetchOptions.fetchFn = req.fetchFn
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`,
			fetchOptions,
		)

		if (githubResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				code: 'NO_PACKAGE_JSON',
				message: 'package.json not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubFile = await githubResponse.json()
		const packageContent = Buffer.from(githubFile.content, 'base64').toString('utf8')
		let packageJson

		try {
			packageJson = JSON.parse(packageContent)
		} catch {
			return res.status(422).json({
				success: false,
				message: 'package.json contains invalid JSON',
			})
		}

		const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}
		const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}
		const devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {}

		const treeResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
			fetchOptions,
		)

		if (treeResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (treeResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'Repository not found or private',
			})
		}

		if (!treeResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const treeData = await treeResponse.json()
		const { stack, diagnostics, summary, health, framework, categoryScores, grade, capReason, monorepo } = runDiagnostics({ packageJson, treeData })

		return res.json({
			success: true,
			project: {
				name: packageJson.name || null,
				dependencies,
				devDependencies,
				scripts,
			},
			stack,
			diagnostics,
			summary,
			health,
			framework,
			categoryScores,
			grade,
			score: health?.score ?? null,
			capReason: capReason || null,
			monorepo: Boolean(monorepo),
		})
	} catch (error) {
		if (clientDisconnected || res.writableEnded) {
			return
		}

		if (error && (error.status === 429 || error.status === 404)) {
			return next(error)
		}

		if (overallSignal.aborted || error?.message === TIMEOUT_ERROR_MESSAGE || error?.status === 502) {
			if (!res.headersSent) {
				return res.status(502).json({
					success: false,
					message: TIMEOUT_ERROR_MESSAGE,
				})
			}
			return
		}

		if (error && error.status) {
			return next(error)
		}

		if (!res.headersSent) {
			return res.status(502).json({
				success: false,
				message: TIMEOUT_ERROR_MESSAGE,
			})
		}
	} finally {
		clearTimeout(overallTimer)
	}
}

const handleBuildCheck = async (req, res, next) => {
	const { owner, repo, branch } = req.body || {}

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`,
		)

		if (githubResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				code: 'NO_PACKAGE_JSON',
				message: 'package.json not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubFile = await githubResponse.json()
		const packageContent = Buffer.from(githubFile.content, 'base64').toString('utf8')
		let packageJson

		try {
			packageJson = JSON.parse(packageContent)
		} catch {
			return res.status(422).json({
				success: false,
				message: 'package.json contains invalid JSON',
			})
		}

		if (packageJson.scripts && packageJson.scripts.build) {
			return res.json({
				success: true,
				build: {
					status: 'ready',
					command: 'npm run build',
				},
			})
		}

		return res.json({
			success: true,
			build: {
				status: 'unavailable',
				message: 'No build script is configured in package.json.',
			},
		})
	} catch (error) {
		if (res?.writableEnded || error?.name === 'AbortError') {
			return
		}
		if (error && error.status) {
			return next(error)
		}
		const err = new Error(error?.message || 'Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}
 
const graphLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res, next) => {
		const error = new Error('Too many requests, please try again later.')
		error.status = 429
		next(error)
	},
})

const MAX_CONCURRENT_SCANS = 2
let activeScans = 0

const getActiveScans = () => activeScans
const resetActiveScans = () => {
	activeScans = 0
}

const handleGraph = async (req, res, next) => {
	const { owner, repo, branch, ref } = req.body || {}
	const targetBranch = branch || ref

	if (!owner || !repo || !targetBranch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(targetBranch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	const cached = getCachedGraph(owner, repo, targetBranch)
	if (cached) {
		return res.json({
			success: true,
			...cached,
		})
	}

	if (activeScans >= MAX_CONCURRENT_SCANS) {
		if (typeof res.setHeader === 'function') {
			res.setHeader('Retry-After', '60')
		} else if (typeof res.set === 'function') {
			res.set('Retry-After', '60')
		}
		return res.status(503).json({
			success: false,
			message: 'Deep scan is busy. Try again in a minute.',
		})
	}

	activeScans++
	let slotReleased = false
	const releaseSlot = () => {
		if (!slotReleased) {
			slotReleased = true
			activeScans = Math.max(0, activeScans - 1)
		}
	}

	const clientAbortController = new AbortController()
	let clientDisconnected = false
	const onDisconnect = () => {
		clientDisconnected = true
		releaseSlot()
		clientAbortController.abort(new Error('Client disconnected'))
	}

	if (req && typeof req.on === 'function') {
		req.on('close', onDisconnect)
		req.on('timeout', onDisconnect)
	}
	if (res && typeof res.on === 'function') {
		res.on('close', onDisconnect)
	}
	if (req?.signal) {
		if (req.signal.aborted) {
			onDisconnect()
		} else {
			req.signal.addEventListener('abort', onDisconnect, { once: true })
		}
	}

	try {
		const archiveOptions = {
			signal: clientAbortController.signal,
		}
		if (req.archiveTotalTimeout || req.archiveDeadlineTimeout || req.body?.archiveTotalTimeout || req.body?.archiveDeadlineTimeout) {
			archiveOptions.totalTimeout = req.archiveTotalTimeout || req.archiveDeadlineTimeout || req.body?.archiveTotalTimeout || req.body?.archiveDeadlineTimeout
		}
		if (req.archiveConnectTimeout || req.archiveHeaderTimeout || req.body?.archiveConnectTimeout || req.body?.archiveHeaderTimeout) {
			archiveOptions.connectTimeout = req.archiveConnectTimeout || req.archiveHeaderTimeout || req.body?.archiveConnectTimeout || req.body?.archiveHeaderTimeout
		}
		if (req.fetchFn) {
			archiveOptions.fetchFn = req.fetchFn
		}

		const archiveResult = await fetchRepoArchive(owner, repo, targetBranch, archiveOptions)
		const graphResult = buildGraph(archiveResult.files, [], {
			truncated: Boolean(archiveResult.truncated),
		})

		const graphLanguages = {}
		for (const node of graphResult.nodes) {
			const lang = node.lang || 'other'
			graphLanguages[lang] = (graphLanguages[lang] || 0) + 1
		}

		const STANDARD_INVENTORY_LANGUAGES = new Set([
			'javascript', 'jsx', 'typescript', 'tsx', 'vue',
			'json', 'markdown', 'html', 'css', 'scss', 'sass', 'less',
			'python', 'go', 'rust', 'java', 'c', 'cpp', 'ruby', 'php',
			'shell', 'yaml', 'sql', 'xml', 'graphql', 'svg'
		])

		const inventoryOnlyLanguages = {}
		if (archiveResult.inventory && archiveResult.inventory.byLanguage) {
			for (const [rawLang, count] of Object.entries(archiveResult.inventory.byLanguage)) {
				const lang = rawLang.toLowerCase()
				if (lang !== 'binary' && !graphLanguages[lang]) {
					const canonical = STANDARD_INVENTORY_LANGUAGES.has(lang) ? lang : 'other'
					inventoryOnlyLanguages[canonical] = (inventoryOnlyLanguages[canonical] || 0) + count
				}
			}
		} else if (graphResult.coverage?.inventoryOnlyLanguages) {
			for (const [rawLang, count] of Object.entries(graphResult.coverage.inventoryOnlyLanguages)) {
				const lang = rawLang.toLowerCase()
				const canonical = STANDARD_INVENTORY_LANGUAGES.has(lang) ? lang : 'other'
				inventoryOnlyLanguages[canonical] = (inventoryOnlyLanguages[canonical] || 0) + count
			}
		}

		const coverage = {
			analyzedFiles: archiveResult.inventory.analyzedFiles,
			totalFiles: archiveResult.inventory.totalFiles,
			skipped: archiveResult.inventory.skipped,
			truncated: Boolean(archiveResult.truncated || graphResult.truncated),
			graphNodesOmitted: graphResult.graphNodesOmitted || 0,
			approximate: true,
			graphLanguages,
			inventoryOnlyLanguages,
			graphFiles: graphResult.nodes.length,
		}

		const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'http'
		const host = (typeof req.get === 'function' ? req.get('host') : req.headers?.host) || 'localhost:3000'
		const defaultBase = `${proto}://${host}`
		const rawBase = (process.env.PUBLIC_BASE_URL || defaultBase).trim()
		const baseUrl = (rawBase.startsWith('http://') || rawBase.startsWith('https://') ? rawBase : `https://${rawBase}`).replace(/\/+$/, '')
		const badgeUrl = `${baseUrl}/api/badge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
		const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
		const disclaimer = 'Note: The backend must be publicly reachable for this badge to render on GitHub.'
		const badgeMarkdown = `[![SetupDoctor Grade](${badgeUrl})](${repoUrl})\n\n> ${disclaimer}`

		const responsePayload = {
			inventory: archiveResult.inventory,
			graph: {
				nodes: graphResult.nodes,
				edges: graphResult.edges,
				externals: graphResult.externals,
			},
			summary: graphResult.summary,
			coverage,
			graphFiles: graphResult.nodes.length,
			score: graphResult.score,
			grade: graphResult.grade,
			capReason: graphResult.capReason,
			profile: graphResult.summary?.profile,
			dimensions: graphResult.summary?.dimensions,
			findings: graphResult.summary?.findings,
			changes: graphResult.summary?.changes,
			badge: {
				url: badgeUrl,
				markdown: badgeMarkdown,
			},
		}


		setCachedGraph(owner, repo, targetBranch, responsePayload)

		return res.json({
			success: true,
			...responsePayload,
		})
	} catch (error) {
		if (clientDisconnected || error?.name === 'AbortError') {
			return
		}
		if (error && (error.status === 429 || error.status === 404 || error.status === 413 || error.status === 400 || error.status === 504)) {
			return next(error)
		}
		if (error && error.status) {
			return next(error)
		}
		const err = new Error(error?.message || 'Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	} finally {
		releaseSlot()
		if (req && typeof req.removeListener === 'function') {
			req.removeListener('close', onDisconnect)
			req.removeListener('timeout', onDisconnect)
		}
		if (res && typeof res.removeListener === 'function') {
			res.removeListener('close', onDisconnect)
		}
	}
}

async function handleChangeImpact(req, res, next) {
	let { repositoryUrl, owner, repo, pullNumber, base, head } = req.body || {}

	if (typeof repositoryUrl === 'string') {
		const pullMatch = repositoryUrl.match(/\/pull\/(\d+)/i)
		if (pullMatch) {
			pullNumber = parseInt(pullMatch[1], 10)
			repositoryUrl = repositoryUrl.replace(/\/pull\/\d+.*$/, '')
		}
	}

	if (!owner || !repo) {
		if (!repositoryUrl) {
			const err = new Error('Please provide repositoryUrl and pullNumber or base/head')
			err.status = 400
			return next(err)
		}
		try {
			const parsed = parseRepository(repositoryUrl)
			owner = parsed.owner
			repo = parsed.repo
		} catch (parseErr) {
			const err = new Error(parseErr.message || 'Invalid repository URL')
			err.status = 400
			return next(err)
		}
	}

	pullNumber = pullNumber ? parseInt(pullNumber, 10) : null
	if (!pullNumber && (!base || !head)) {
		const err = new Error('Please provide a pullNumber or both base and head')
		err.status = 400
		return next(err)
	}

	const clientAbortController = new AbortController()
	let clientDisconnected = false
	const onDisconnect = () => {
		clientDisconnected = true
		clientAbortController.abort(new Error('Client disconnected'))
	}

	if (req && typeof req.on === 'function') {
		req.on('close', onDisconnect)
		req.on('timeout', onDisconnect)
	}
	if (res && typeof res.on === 'function') {
		res.on('close', onDisconnect)
	}
	if (req?.signal) {
		if (req.signal.aborted) {
			onDisconnect()
		} else {
			req.signal.addEventListener('abort', onDisconnect, { once: true })
		}
	}

	try {
		const fetchFn = req.fetchFn || req.body?.fetchFn
		const signal = clientAbortController.signal

		// 1. Fetch changed files
		let changeData
		if (pullNumber) {
			changeData = await fetchPullRequestChanges({
				owner,
				repo,
				pullNumber,
				signal,
				fetchFn,
			})
		} else {
			changeData = await fetchCompareChanges({
				owner,
				repo,
				base,
				head,
				signal,
				fetchFn,
			})
		}

		const { headSha, baseRef, changedFiles, truncated } = changeData

		// 2. Check 10-minute cache per (repo, pull, headSha) or (repo, base, head, headSha)
		const cacheKey = pullNumber
			? `${owner.toLowerCase()}/${repo.toLowerCase()}/pull/${pullNumber}/${headSha}`
			: `${owner.toLowerCase()}/${repo.toLowerCase()}/compare/${base}...${head}/${headSha}`

		const cached = getCachedChangeImpact(cacheKey)
		if (cached) {
			return res.json({
				success: true,
				cached: true,
				...cached,
			})
		}

		// 3. Analyze base branch graph
		const archiveOptions = {
			signal: clientAbortController.signal,
		}
		if (req.archiveTotalTimeout || req.body?.archiveTotalTimeout) {
			archiveOptions.totalTimeout = req.archiveTotalTimeout || req.body?.archiveTotalTimeout
		}
		if (req.archiveConnectTimeout || req.body?.archiveConnectTimeout) {
			archiveOptions.connectTimeout = req.archiveConnectTimeout || req.body?.archiveConnectTimeout
		}
		if (fetchFn) {
			archiveOptions.fetchFn = fetchFn
		}

		let baseGraphData = getCachedGraph(owner, repo, baseRef) || getCachedGraphCaseInsensitive(owner, repo)
		let baseFiles = null

		if (!baseGraphData) {
			const archiveResult = await fetchRepoArchive(owner, repo, baseRef, archiveOptions)
			baseFiles = archiveResult.files
			const graphResult = buildGraph(archiveResult.files, [], {
				truncated: Boolean(archiveResult.truncated),
			})
			baseGraphData = {
				graph: {
					nodes: graphResult.nodes,
					edges: graphResult.edges,
					externals: graphResult.externals,
				},
				summary: graphResult.summary,
				profile: graphResult.summary?.profile,
			}
			setCachedGraph(owner, repo, baseRef, baseGraphData)
		}

		const graphToUse = baseGraphData.graph ? {
			nodes: baseGraphData.graph.nodes,
			edges: baseGraphData.graph.edges,
			summary: baseGraphData.summary || {},
		} : baseGraphData

		// 4. Compute change impact deterministically
		const impactResult = computeChangeImpact({
			changedFiles,
			baseGraph: graphToUse,
			baseFiles,
			owner,
			repo,
			pullNumber,
			baseRef,
			headSha,
			truncated,
		})

		const responsePayload = {
			repository: { owner, repo },
			pullNumber: pullNumber || null,
			base: baseRef,
			head: headSha,
			prTitle: changeData.prTitle || null,
			...impactResult,
		}

		setCachedChangeImpact(cacheKey, responsePayload)

		return res.json({
			success: true,
			cached: false,
			...responsePayload,
		})
	} catch (error) {
		if (clientDisconnected || error?.name === 'AbortError') {
			return
		}
		if (error && (error.status === 404 || error.status === 429 || error.status === 400 || error.status === 504)) {
			return next(error)
		}
		if (error && error.status) {
			return next(error)
		}
		const err = new Error(error?.message || 'Unable to analyze change impact')
		err.status = 502
		return next(err)
	} finally {
		if (req && typeof req.removeListener === 'function') {
			req.removeListener('close', onDisconnect)
			req.removeListener('timeout', onDisconnect)
		}
		if (res && typeof res.removeListener === 'function') {
			res.removeListener('close', onDisconnect)
		}
	}
}

router.get('/tree', handleTree)
router.get('/repository/tree', handleTree)

router.get('/file', handleFile)
router.get('/repository/file', handleFile)

router.post('/diagnose', handleDiagnose)
router.post('/repository/diagnose', handleDiagnose)

router.post('/build-check', handleBuildCheck)
router.post('/repository/build-check', handleBuildCheck)

router.post('/graph', graphLimiter, handleGraph)
router.post('/repository/graph', graphLimiter, handleGraph)

router.post('/change-impact', handleChangeImpact)
router.post('/repository/change-impact', handleChangeImpact)

router.get('/badge/:owner/:repo', handleBadge)
router.get('/repository/badge/:owner/:repo', handleBadge)

module.exports = router
module.exports.handleGraph = handleGraph
module.exports.handleChangeImpact = handleChangeImpact
function getBadgeUrl(owner, repo, req = {}) {
	const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http'
	const host = (typeof req?.get === 'function' ? req.get('host') : req?.headers?.host) || 'localhost:3000'
	const defaultBase = `${proto}://${host}`
	const rawBase = (process.env.PUBLIC_BASE_URL || defaultBase).trim()
	const baseUrl = (rawBase.startsWith('http://') || rawBase.startsWith('https://') ? rawBase : `https://${rawBase}`).replace(/\/+$/, '')
	return `${baseUrl}/api/badge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function getBadgeMarkdown(owner, repo, req = {}) {
	const badgeUrl = getBadgeUrl(owner, repo, req)
	const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
	return `[![SetupDoctor Grade](${badgeUrl})](${repoUrl})`
}

module.exports.getBadgeUrl = getBadgeUrl
module.exports.getBadgeMarkdown = getBadgeMarkdown
module.exports.handleBadge = handleBadge
module.exports.handleDiagnose = handleDiagnose
module.exports.graphLimiter = graphLimiter
module.exports.getActiveScans = getActiveScans
module.exports.resetActiveScans = resetActiveScans
module.exports.MAX_CONCURRENT_SCANS = MAX_CONCURRENT_SCANS
