const { normalizeContext } = require('./utils')

const rule = {
	id: 'gitignore-essentials',
	title: 'Essential .gitignore Patterns',
	severity: 'warn',
	weight: 1,
	category: 'security',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)

		if (!filePaths.has('.gitignore')) {
			return {
				status: 'warn',
				message: '.gitignore is missing; node_modules, dist, and .env should be ignored.',
				fix: {
					description: 'Add a .gitignore file containing node_modules, dist, and .env.',
					snippet: 'node_modules/\ndist/\n.env',
				},
			}
		}

		const trackedUnwanted = [...filePaths].filter((path) => {
			if (typeof path !== 'string') return false
			return (
				path === '.env' ||
				path.endsWith('/.env') ||
				path.startsWith('node_modules/') ||
				path.includes('/node_modules/') ||
				path.startsWith('dist/') ||
				path.includes('/dist/')
			)
		})

		if (trackedUnwanted.length > 0) {
			return {
				status: 'warn',
				message: `Essential patterns are violated; unwanted files tracked: ${trackedUnwanted.slice(0, 3).join(', ')}.`,
				fix: {
					description: 'Add node_modules, dist, and .env to .gitignore and untrack existing files.',
					snippet: 'node_modules/\ndist/\n.env',
				},
			}
		}

		return {
			status: 'pass',
			message: 'Essential .gitignore items (node_modules, dist, .env) are properly respected.',
			fix: null,
		}
	},
}

module.exports = rule
