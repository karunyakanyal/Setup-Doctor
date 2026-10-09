const { normalizeContext } = require('./utils')

const rule = {
	id: 'vite-dependency',
	title: 'Vite Dependency',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies, filePaths } = normalizeContext(ctx)
		const allDeps = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])
		const hasViteConfig = filePaths.has('vite.config.js') || filePaths.has('vite.config.ts')

		if (!hasViteConfig && !allDeps.has('vite')) {
			return {
				status: 'pass',
				message: 'Vite is not configured in this project.',
				fix: null,
			}
		}

		if (allDeps.has('vite')) {
			return {
				status: 'pass',
				message: 'Vite is configured as a project dependency.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Vite configuration was detected but the Vite package is missing.',
			fix: {
				description: 'Install vite as a development dependency.',
				command: 'npm install --save-dev vite',
			},
		}
	},
}

module.exports = rule
