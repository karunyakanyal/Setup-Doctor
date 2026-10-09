const { normalizeContext } = require('./utils')

const rule = {
	id: 'dependency-count',
	title: 'Dependency Count',
	severity: 'info',
	weight: 0,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const prodCount = Object.keys(dependencies).length
		const devCount = Object.keys(devDependencies).length

		return {
			status: 'info',
			message: `${prodCount} production dependencies and ${devCount} development dependencies are configured.`,
			fix: null,
		}
	},
}

module.exports = rule
