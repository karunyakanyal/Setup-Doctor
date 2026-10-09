const { normalizeContext } = require('./utils')

const rule = {
	id: 'gitignore',
	title: '.gitignore Configuration',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)

		if (filePaths.has('.gitignore')) {
			return {
				status: 'pass',
				message: '.gitignore is present.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: '.gitignore is missing.',
			fix: {
				description: 'Create a .gitignore file to ignore dependencies, build outputs, and environment variables.',
				snippet: 'node_modules/\n.env\ndist/',
			},
		}
	},
}

module.exports = rule
