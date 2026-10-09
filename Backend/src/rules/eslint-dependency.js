const { normalizeContext } = require('./utils')

const rule = {
	id: 'eslint-dependency',
	title: 'ESLint Dependency',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies, filePaths } = normalizeContext(ctx)
		const allDeps = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])
		const hasEslintConfig = [...filePaths].some((path) =>
			/(^|\/)(eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|\.eslintrc)$/.test(path),
		)

		if (!hasEslintConfig && !allDeps.has('eslint')) {
			return {
				status: 'pass',
				message: 'ESLint is not configured in this project.',
				fix: null,
			}
		}

		if (allDeps.has('eslint')) {
			return {
				status: 'pass',
				message: 'ESLint is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'ESLint configuration exists but the eslint package is missing.',
			fix: {
				description: 'Install eslint as a development dependency.',
				command: 'npm install --save-dev eslint',
			},
		}
	},
}

module.exports = rule
