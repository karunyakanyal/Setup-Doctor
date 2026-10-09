const { normalizeContext } = require('./utils')

const rule = {
	id: 'build-script',
	title: 'Build Script Configuration',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { scripts } = normalizeContext(ctx)

		if (scripts.build) {
			return {
				status: 'pass',
				message: 'Build script is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Build script is missing.',
			fix: {
				description: 'Add a build script to the scripts section of package.json.',
				snippet: '"build": "vite build"',
			},
		}
	},
}

module.exports = rule
