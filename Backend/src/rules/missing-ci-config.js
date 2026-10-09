const { normalizeContext } = require('./utils')

const rule = {
	id: 'missing-ci-config',
	title: 'Continuous Integration Workflow',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
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

		return {
			status: 'warn',
			message: 'No CI workflow configuration found in .github/workflows.',
			fix: {
				description: 'Create a GitHub Actions CI workflow in .github/workflows/ci.yml.',
				snippet: 'name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm test',
			},
		}
	},
}

module.exports = rule
