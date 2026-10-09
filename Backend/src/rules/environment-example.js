const { normalizeContext, isIgnoredPath, hasEnvironmentUsage } = require('./utils')

const rule = {
	id: 'environment-example',
	title: '.env.example Presence',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const hasEnvExample = [...filePaths].some(
			(path) => typeof path === 'string' && path.split('/').pop() === '.env.example' && !isIgnoredPath(path),
		)

		if (hasEnvExample) {
			return {
				status: 'pass',
				message: '.env.example is present.',
				fix: null,
			}
		}

		if (hasEnvironmentUsage(ctx)) {
			return {
				status: 'warn',
				message: '.env.example is missing; add one if the project needs environment variables.',
				fix: {
					description: 'Create a .env.example containing variable names without secrets.',
					snippet: 'PORT=5000\nNODE_ENV=development',
				},
			}
		}

		return {
			status: 'info',
			message: '.env.example not needed; no environment usage detected.',
			fix: null,
		}
	},
}

module.exports = rule
