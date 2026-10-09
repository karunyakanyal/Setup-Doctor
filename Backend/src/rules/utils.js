const semver = require('semver')

const IGNORED_PATH_SEGMENTS = new Set([
	'__tests__',
	'__fixtures__',
	'fixtures',
	'fixture',
	'test',
	'tests',
	'e2e',
	'examples',
	'example',
	'playground',
	'samples',
	'docs',
	'node_modules',
])

function isIgnoredPath(filePath, options = {}) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return false
	}
	const normalized = filePath.replace(/\\/g, '/')
	const segments = normalized.split('/').filter(Boolean)
	const except = options && options.except ? new Set(options.except.map((s) => s.toLowerCase())) : null
	return segments.some((segment) => {
		const lower = segment.toLowerCase()
		if (except && except.has(lower)) {
			return false
		}
		return IGNORED_PATH_SEGMENTS.has(lower)
	})
}

function isCandidateEnvFile(filePath) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return false
	}
	const normalized = filePath.replace(/\\/g, '/')
	const segments = normalized.split('/').filter(Boolean)
	if (segments.length === 0) {
		return false
	}
	const fileName = segments[segments.length - 1]
	if (fileName !== '.env') {
		return false
	}
	// Root .env is depth 0 (length 1). packages/x/.env is depth 2 (length 3).
	const depth = segments.length - 1
	if (depth > 2) {
		return false
	}
	if (isIgnoredPath(filePath)) {
		return false
	}
	return true
}

function formatList(items = [], max = 3) {
	if (!Array.isArray(items) || items.length === 0) {
		return ''
	}
	if (items.length <= max) {
		return items.join(', ')
	}
	const head = items.slice(0, max).join(', ')
	const remaining = items.length - max
	return `${head} and ${remaining} more`
}

function getMajorVersion(version) {
	if (typeof version !== 'string' || !version.trim()) {
		return null
	}
	const min = semver.minVersion(version.trim())
	if (min) {
		return min.major
	}
	const coerced = semver.coerce(version.trim())
	return coerced ? coerced.major : null
}

function isValidDependencyVersion(version) {
	if (typeof version !== 'string') {
		return false
	}
	const trimmed = version.trim()
	if (!trimmed) {
		return false
	}

	// 1. Anything semver.validRange accepts
	if (semver.validRange(trimmed) !== null) {
		return true
	}

	// 2. Protocols: workspace:, catalog:, npm:, link:, file:, portal:
	if (/^(workspace|catalog|npm|link|file|portal):/i.test(trimmed)) {
		return true
	}

	// 3. Git / http(s) URLs
	if (/^(git(\+[a-z0-9_-]+)?|https?|ssh|file):\/\//i.test(trimmed) || /^git@[a-z0-9_.-]+:/i.test(trimmed)) {
		return true
	}

	// 4. GitHub shorthand: user/repo, github:user/repo, with optional #commit/branch
	if (/^(github:)?[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(#[a-zA-Z0-9_./-]+)?$/i.test(trimmed)) {
		return true
	}

	// 5. Dist-tags (latest, next, beta, canary, etc.)
	if (/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(trimmed)) {
		return true
	}

	return false
}

function normalizeContext(ctx = {}) {
	if (Array.isArray(ctx)) {
		return {
			packageJson: {},
			scripts: {},
			dependencies: {},
			devDependencies: {},
			engines: {},
			filePaths: new Set(ctx),
			treeData: {},
		}
	}

	if (ctx instanceof Set) {
		return {
			packageJson: {},
			scripts: {},
			dependencies: {},
			devDependencies: {},
			engines: {},
			filePaths: ctx,
			treeData: {},
		}
	}

	const packageJson = ctx.packageJson || (ctx.dependencies || ctx.scripts || ctx.devDependencies || ctx.engines ? ctx : {})
	const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : (ctx.scripts || {})
	const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : (ctx.dependencies || {})
	const devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : (ctx.devDependencies || {})
	const engines = packageJson.engines && typeof packageJson.engines === 'object' ? packageJson.engines : (ctx.engines || {})

	let filePaths = new Set()
	if (ctx.filePaths instanceof Set) {
		filePaths = ctx.filePaths
	} else if (Array.isArray(ctx.filePaths)) {
		filePaths = new Set(ctx.filePaths)
	} else if (ctx.treeData && Array.isArray(ctx.treeData.tree)) {
		filePaths = new Set(ctx.treeData.tree.filter((i) => i.type === 'blob').map((i) => i.path))
	} else if (Array.isArray(ctx.files)) {
		filePaths = new Set(ctx.files)
	}

	return {
		packageJson,
		scripts,
		dependencies,
		devDependencies,
		engines,
		filePaths,
		treeData: ctx.treeData || {},
	}
}

function hasEnvironmentUsage(ctx) {
	const { filePaths, dependencies, devDependencies, scripts } = normalizeContext(ctx)

	// 1. Real .env at root or depth <= 2 (not ignored)
	const hasEnvFile = [...filePaths].some((path) => isCandidateEnvFile(path))
	if (hasEnvFile) {
		return true
	}

	// 2. Dependencies like dotenv, cross-env
	const allDeps = { ...dependencies, ...devDependencies }
	const hasEnvDep = Object.keys(allDeps).some((name) =>
		/dotenv|cross-env/i.test(name),
	)
	if (hasEnvDep) {
		return true
	}

	// 3. Env-reading scripts
	const hasEnvScript = Object.values(scripts).some((script) =>
		typeof script === 'string' &&
		(/dotenv|cross-env|--env-file/i.test(script) ||
		 /\b(NODE_ENV|PORT|ENV)\s*=/i.test(script) ||
		 /\.env\b/i.test(script)),
	)
	if (hasEnvScript) {
		return true
	}

	return false
}

module.exports = {
	IGNORED_PATH_SEGMENTS,
	isIgnoredPath,
	isCandidateEnvFile,
	formatList,
	getMajorVersion,
	isValidDependencyVersion,
	normalizeContext,
	hasEnvironmentUsage,
}
