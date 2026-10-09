const { normalizeContext } = require('./utils')

const rule = {
	id: 'environment-file-safety',
	title: 'Environment File Safety',
	severity: 'error',
	weight: 1,
	category: 'security',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const hasEnvFile = [...filePaths].some((path) => typeof path === 'string' && path.split('/').pop() === '.env')

		if (hasEnvFile) {
			return {
				status: 'fail',
				message: 'A .env file is committed; environment files may contain secrets.',
				fix: {
					description: 'Remove .env from version control and ensure it is listed in .gitignore.',
					command: 'git rm --cached .env',
				},
			}
		}

		return {
			status: 'pass',
			message: 'No committed .env file was found.',
			fix: null,
		}
	},
}

module.exports = rule
