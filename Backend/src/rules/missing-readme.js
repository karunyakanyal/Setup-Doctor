const { normalizeContext } = require('./utils')

const rule = {
	id: 'missing-readme',
	title: 'README Documentation Presence',
	severity: 'warn',
	weight: 1,
	category: 'docs',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const readmeFiles = ['README.md', 'README', 'README.txt', 'readme.md'].filter((fileName) => filePaths.has(fileName))

		if (readmeFiles.length > 0) {
			return {
				status: 'pass',
				message: 'README file is present.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Repository is missing a README.md file.',
			fix: {
				description: 'Create a README.md containing project setup and run instructions.',
				snippet: '# Project Title\n\n## Getting Started\n\n```bash\nnpm install\nnpm run dev\n```',
			},
		}
	},
}

module.exports = rule
