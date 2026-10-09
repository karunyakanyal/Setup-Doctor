const { normalizeContext } = require('./utils')

const rule = {
	id: 'dev-script',
	title: 'Dev Script Configuration',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { scripts } = normalizeContext(ctx)

		if (scripts.dev) {
			return {
				status: 'pass',
				message: 'Dev script is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Dev script is missing.',
			fix: {
				description: 'Add a dev script to the scripts section of package.json.',
				snippet: '"dev": "vite"',
			},
		}
	},
}

module.exports = rule
