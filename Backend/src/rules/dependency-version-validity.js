const { normalizeContext, isValidDependencyVersion } = require('./utils')

const rule = {
	id: 'dependency-version-validity',
	title: 'Dependency Version Validity',
	severity: 'error',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const allEntries = [...Object.entries(dependencies), ...Object.entries(devDependencies)]

		const allValid = allEntries.every(([, version]) => isValidDependencyVersion(version))

		if (allValid) {
			return {
				status: 'pass',
				message: 'Dependency version values use valid npm version ranges.',
				fix: null,
			}
		}

		return {
			status: 'fail',
			message: 'One or more dependency version values are empty or use an invalid npm version range.',
			fix: {
				description: 'Replace invalid dependency versions in package.json with valid semver range expressions.',
				snippet: '"package-name": "^1.0.0"',
			},
		}
	},
}

module.exports = rule
