const { normalizeContext, isIgnoredPath, isCandidateEnvFile } = require('./utils')

const rule = {
	id: 'environment-documentation',
	title: 'Environment Configuration Documentation',
	severity: 'warn',
	weight: 1,
	category: 'docs',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const hasEnvExample = [...filePaths].some((path) => typeof path === 'string' && path.split('/').pop() === '.env.example' && !isIgnoredPath(path))
		const hasEnvFile = [...filePaths].some((path) => isCandidateEnvFile(path))

		if (hasEnvExample) {
			return {
				status: 'pass',
				message: '.env.example documents the environment configuration.',
				fix: null,
			}
		}

		if (hasEnvFile) {
			return {
				status: 'warn',
				message: '.env is present without .env.example documentation.',
				fix: {
					description: 'Create a .env.example containing environment variable templates.',
					snippet: 'PORT=5000\nNODE_ENV=development',
				},
			}
		}

		return {
			status: 'pass',
			message: 'No environment configuration was detected.',
			fix: null,
		}
	},
}

module.exports = rule
