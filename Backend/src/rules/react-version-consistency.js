const { normalizeContext, getMajorVersion } = require('./utils')

const rule = {
	id: 'react-version-consistency',
	title: 'React Version Consistency',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const reactVersion = dependencies.react || devDependencies.react
		const reactDomVersion = dependencies['react-dom'] || devDependencies['react-dom']

		if (!reactVersion || !reactDomVersion) {
			return {
				status: 'pass',
				message: 'Not applicable or React/React DOM packages not both declared.',
				fix: null,
			}
		}

		const reactMajor = getMajorVersion(reactVersion)
		const reactDomMajor = getMajorVersion(reactDomVersion)
		const versionsMatch = reactMajor !== null && reactMajor === reactDomMajor

		if (versionsMatch) {
			return {
				status: 'pass',
				message: 'React and React DOM major versions match.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'React and React DOM major versions do not match or could not be compared.',
			fix: {
				description: 'Update react and react-dom to matching major versions in package.json.',
				command: 'npm install react@^19.0.0 react-dom@^19.0.0',
			},
		}
	},
}

module.exports = rule
