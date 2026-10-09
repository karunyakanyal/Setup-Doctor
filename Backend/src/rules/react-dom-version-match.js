const { normalizeContext } = require('./utils')
const { detectFramework } = require('./framework')

const rule = {
	id: 'react-dom-version-match',
	title: 'React and React DOM Version Alignment',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies, packageJson } = normalizeContext(ctx)
		const framework = ctx.framework || detectFramework(packageJson)
		const allDeps = { ...dependencies, ...devDependencies }

		if (framework !== 'react' && !allDeps.react) {
			return {
				status: 'pass',
				message: 'Not a React project.',
				fix: null,
			}
		}

		const reactVersion = allDeps.react
		const reactDomVersion = allDeps['react-dom']

		if (reactVersion && reactDomVersion && reactVersion === reactDomVersion) {
			return {
				status: 'pass',
				message: 'React and React DOM versions match.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'React and React DOM versions do not match or react-dom is missing.',
			fix: {
				description: 'Align react and react-dom versions in package.json.',
				command: 'npm install react@^19.0.0 react-dom@^19.0.0',
			},
		}
	},
}

module.exports = rule
