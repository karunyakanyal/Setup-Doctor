const semver = require('semver')
const { normalizeContext, detectNodeVersion } = require('./utils')

const rule = {
	id: 'node-engine',
	title: 'Node.js Engine Requirement',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const eng = ctx && typeof ctx === 'object' && 'engines' in ctx && typeof ctx.engines === 'object'
			? ctx.engines
			: (ctx && typeof ctx === 'object' && 'node' in ctx ? ctx : null)
		const normalized = normalizeContext(ctx)
		const engines = eng || normalized.engines || {}
		const hasNode = Boolean(engines && Object.prototype.hasOwnProperty.call(engines, 'node') && engines.node)

		if (hasNode) {
			return {
				status: 'pass',
				message: `Node.js requirement is configured as ${engines.node}.`,
				fix: null,
			}
		}

		const detected = detectNodeVersion(ctx, normalized)
		let recommendedRange = '>=22 <25'
		let description = 'Declare a Node.js version range in package.json engines.node compatible with your dependencies and deployment environment. Confirm your project compatibility instead of assuming a default version. Note that engines.node declares compatibility and does not install or switch the active Node.js runtime (use .nvmrc as a complementary tool to specify the active runtime). An illustrative example is ">=22 <25", but the actual range must be verified for your project.'

		if (detected) {
			if (semver.validRange(detected) || semver.valid(detected)) {
				const coerced = semver.coerce(detected)
				recommendedRange = coerced ? `>=${coerced.major}.0.0` : detected
			} else {
				recommendedRange = detected
			}
			description = `Declare an engines.node field in package.json compatible with your project dependencies and detected runtime configuration (${detected}). Note that engines.node declares compatibility and does not install or switch the active Node.js runtime; communicate the intended runtime with .nvmrc if needed.`
		}

		return {
			status: 'warn',
			message: 'The project does not specify a Node.js version requirement.',
			fix: {
				description,
				snippet: `"engines": {\n  "node": "${recommendedRange}"\n}`,
			},
		}
	},
}

module.exports = rule
