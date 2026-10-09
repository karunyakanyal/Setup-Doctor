const semver = require('semver')

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
	if (typeof version !== 'string' || !version.trim()) {
		return false
	}
	return semver.validRange(version.trim()) !== null
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

module.exports = {
	getMajorVersion,
	isValidDependencyVersion,
	normalizeContext,
}
