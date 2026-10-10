const semver = require('semver')
const { normalizeContext, detectNodeVersion } = require('./utils')

const rule = {
	id: 'missing-nvmrc-or-engines',
	title: 'Node.js Version Pinning (.nvmrc or engines)',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const normalized = normalizeContext(ctx)
		const { engines, filePaths } = normalized
		const hasEnginesNode = Boolean(engines && engines.node)
		const hasNvmrc = filePaths.has('.nvmrc') || filePaths.has('.node-version')

		if (hasEnginesNode || hasNvmrc) {
			return {
				status: 'pass',
				message: 'Node.js version is specified via engines or .nvmrc.',
				fix: null,
			}
		}

		const detected = detectNodeVersion(ctx, normalized)
		let recommendedRange = '>=22 <25'
		let description = 'Specify supported Node.js version range in package.json engines or pin the runtime in an .nvmrc file. Confirm compatibility with your dependencies and deployment environment rather than assuming a universal version. An illustrative example is ">=22 <25", but the actual range must be verified for your project.'

		if (detected) {
			if (semver.validRange(detected) || semver.valid(detected)) {
				const coerced = semver.coerce(detected)
				recommendedRange = coerced ? `>=${coerced.major}.0.0` : detected
			} else {
				recommendedRange = detected
			}
			description = `Specify supported Node.js version range in package.json engines or pin the runtime in an .nvmrc file compatible with your project dependencies and detected runtime configuration (${detected}). Confirm compatibility with your dependencies and deployment environment rather than assuming a universal version.`
		}

		return {
			status: 'warn',
			message: 'Project does not specify a Node.js version via package.json engines or .nvmrc.',
			fix: {
				description,
				snippet: `"engines": {\n  "node": "${recommendedRange}"\n}`,
			},
		}
	},
}

module.exports = rule
