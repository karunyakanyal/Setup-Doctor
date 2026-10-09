const { normalizeContext, isCandidateEnvFile, formatList } = require('./utils')

const rule = {
	id: 'environment-file-safety',
	title: 'Environment File Safety',
	severity: 'error',
	weight: 1,
	category: 'security',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const envFiles = [...filePaths].filter((path) => isCandidateEnvFile(path))

		if (envFiles.length > 0) {
			const formattedList = formatList(envFiles, 3)
			return {
				status: 'fail',
				message: `A .env file is committed (${formattedList}); environment files may contain secrets.`,
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
