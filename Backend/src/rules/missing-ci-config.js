const semver = require('semver')
const { normalizeContext } = require('./utils')

function detectNodeVersion(ctx, normalized) {
	if (ctx && typeof ctx === 'object') {
		if (typeof ctx.nodeVersion === 'string' && ctx.nodeVersion.trim()) return ctx.nodeVersion.trim()
		if (typeof ctx.runtimeVersion === 'string' && ctx.runtimeVersion.trim()) return ctx.runtimeVersion.trim()
		if (typeof ctx.runtime === 'string' && ctx.runtime.trim()) return ctx.runtime.trim()
		if (typeof ctx.nvmrc === 'string' && ctx.nvmrc.trim()) return ctx.nvmrc.trim()
		if (typeof ctx.nodeVersionFile === 'string' && ctx.nodeVersionFile.trim()) return ctx.nodeVersionFile.trim()
	}
	const { packageJson, dependencies, devDependencies } = normalized
	if (packageJson && packageJson.volta && typeof packageJson.volta.node === 'string' && packageJson.volta.node.trim()) {
		return packageJson.volta.node.trim()
	}
	const typesNode = (devDependencies && devDependencies['@types/node']) || (dependencies && dependencies['@types/node'])
	if (typeof typesNode === 'string' && typesNode.trim()) {
		const coerced = semver.coerce(typesNode.trim())
		if (coerced) {
			return `${coerced.major}`
		}
	}
	return null
}

const rule = {
	id: 'missing-ci-config',
	title: 'Continuous Integration Workflow',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const normalized = normalizeContext(ctx)
		const { filePaths } = normalized
		const hasCi = [...filePaths].some((path) =>
			typeof path === 'string' && /^\.github\/workflows\/[^/]+\.(ya?ml)$/i.test(path),
		)

		if (hasCi) {
			return {
				status: 'pass',
				message: 'CI workflow configuration is present.',
				fix: null,
			}
		}

		const detected = detectNodeVersion(ctx, normalized)
		let nodeVersionStr = '22'
		let description = 'Create a GitHub Actions CI workflow in .github/workflows/ci.yml. The Node.js version shown in the snippet is illustrative; verify compatibility with your project dependencies and environment.'

		if (detected) {
			const coerced = semver.coerce(detected)
			nodeVersionStr = coerced ? `${coerced.major}` : detected
			description = `Create a GitHub Actions CI workflow in .github/workflows/ci.yml using your detected Node.js runtime version (${nodeVersionStr}).`
		}

		return {
			status: 'warn',
			message: 'No CI workflow configuration found in .github/workflows.',
			fix: {
				description,
				snippet: `name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersionStr}\n      - run: npm ci\n      - run: npm test`,
			},
		}
	},
}

module.exports = rule
