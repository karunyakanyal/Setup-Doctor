const { normalizeContext } = require('./utils')

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
		const engines = eng || normalizeContext(ctx).engines || {}
		const hasNode = Boolean(engines && Object.prototype.hasOwnProperty.call(engines, 'node') && engines.node)

		if (hasNode) {
			return {
				status: 'pass',
				message: `Node.js requirement is configured as ${engines.node}.`,
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'The project does not specify a Node.js version requirement.',
			fix: {
				description: 'Add an engines.node field to package.json to specify supported Node.js versions.',
				snippet: '"engines": {\n  "node": ">=20.0.0"\n}',
			},
		}
	},
}

module.exports = rule
