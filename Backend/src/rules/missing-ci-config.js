const semver = require('semver')
const { normalizeContext, detectNodeVersion } = require('./utils')

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
