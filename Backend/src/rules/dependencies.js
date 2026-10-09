const { normalizeContext } = require('./utils')

const rule = {
	id: 'dependencies',
	title: 'Dependency Declaration',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const count = Object.keys(dependencies).length + Object.keys(devDependencies).length

		if (count > 0) {
			return {
				status: 'pass',
				message: 'Dependencies are configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'No dependencies or devDependencies are configured.',
			fix: {
				description: 'Install required project dependencies using npm install.',
				command: 'npm install',
			},
		}
	},
}

module.exports = rule
