const { normalizeContext } = require('./utils')

const rule = {
	id: 'missing-nvmrc-or-engines',
	title: 'Node.js Version Pinning (.nvmrc or engines)',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { engines, filePaths } = normalizeContext(ctx)
		const hasEnginesNode = Boolean(engines && engines.node)
		const hasNvmrc = filePaths.has('.nvmrc') || filePaths.has('.node-version')

		if (hasEnginesNode || hasNvmrc) {
			return {
				status: 'pass',
				message: 'Node.js version is specified via engines or .nvmrc.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Project does not specify a Node.js version via package.json engines or .nvmrc.',
			fix: {
				description: 'Specify supported Node.js version range in package.json engines or pin the runtime in an .nvmrc file. Confirm compatibility with your dependencies and deployment environment rather than assuming a universal version.',
				snippet: '"engines": {\n  "node": ">=22 <25"\n}',
			},
		}
	},
}

module.exports = rule
