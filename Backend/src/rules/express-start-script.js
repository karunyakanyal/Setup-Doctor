const { normalizeContext } = require('./utils')
const { detectFramework } = require('./framework')

const rule = {
	id: 'express-start-script',
	title: 'Express Start Script',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { scripts, dependencies, devDependencies, packageJson } = normalizeContext(ctx)
		const framework = ctx.framework || detectFramework(packageJson)
		const allDeps = { ...dependencies, ...devDependencies }

		if (framework !== 'express' && !allDeps.express) {
			return {
				status: 'pass',
				message: 'Not an Express project.',
				fix: null,
			}
		}

		if (scripts.start && typeof scripts.start === 'string' && scripts.start.trim()) {
			return {
				status: 'pass',
				message: 'Express start script is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Express project is missing a start script in package.json.',
			fix: {
				description: 'Add a start script to package.json to start the Express server.',
				snippet: '"start": "node src/server.js"',
			},
		}
	},
}

module.exports = rule
