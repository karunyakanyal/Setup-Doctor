const { normalizeContext } = require('./utils')

const rule = {
	id: 'typescript-dependency',
	title: 'TypeScript Dependency',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies, filePaths } = normalizeContext(ctx)
		const allDeps = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])
		const hasTsconfig = filePaths.has('tsconfig.json')

		if (!hasTsconfig && !allDeps.has('typescript')) {
			return {
				status: 'pass',
				message: 'TypeScript is not used in this project.',
				fix: null,
			}
		}

		if (allDeps.has('typescript')) {
			return {
				status: 'pass',
				message: 'TypeScript configuration is consistent.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'tsconfig.json exists but the TypeScript package is missing.',
			fix: {
				description: 'Install typescript as a development dependency.',
				command: 'npm install --save-dev typescript',
			},
		}
	},
}

module.exports = rule
