const { normalizeContext } = require('./utils')

const rule = {
	id: 'react-dependencies',
	title: 'React Dependencies',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const allDeps = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])

		if (!allDeps.has('react')) {
			return {
				status: 'pass',
				message: 'React is not declared in project dependencies.',
				fix: null,
			}
		}

		if (allDeps.has('react-dom')) {
			return {
				status: 'pass',
				message: 'React and React DOM dependencies are configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'React is installed but react-dom is missing.',
			fix: {
				description: 'Install react-dom to match react in dependencies.',
				command: 'npm install react-dom',
			},
		}
	},
}

module.exports = rule
