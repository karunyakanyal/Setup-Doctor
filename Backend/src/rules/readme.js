const { normalizeContext } = require('./utils')

const rule = {
	id: 'readme',
	title: 'Repository Documentation',
	severity: 'warn',
	weight: 1,
	category: 'docs',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const readmeFiles = ['README.md', 'README', 'README.txt'].filter((fileName) => filePaths.has(fileName))

		if (readmeFiles.length > 0) {
			return {
				status: 'pass',
				message: `Repository documentation is present: ${readmeFiles.join(', ')}.`,
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'No README file was found.',
			fix: {
				description: 'Create a README.md containing project setup and run instructions.',
				snippet: '# Project Title\n\n## Getting Started\n\n```bash\nnpm install\nnpm run dev\n```',
			},
		}
	},
}

module.exports = rule
