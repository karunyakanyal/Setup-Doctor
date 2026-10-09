const { normalizeContext } = require('./utils')

const rule = {
	id: 'scripts',
	title: 'npm Scripts Configuration',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { scripts } = normalizeContext(ctx)
		const hasScripts = Object.keys(scripts).length > 0

		if (hasScripts) {
			return {
				status: 'pass',
				message: 'Scripts section is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Scripts section is missing.',
			fix: {
				description: 'Add standard scripts to the scripts block in package.json.',
				snippet: '"scripts": {\n  "dev": "node index.js",\n  "test": "node --test"\n}',
			},
		}
	},
}

module.exports = rule
