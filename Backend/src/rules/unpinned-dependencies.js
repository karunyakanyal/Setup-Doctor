const { normalizeContext } = require('./utils')

const rule = {
	id: 'unpinned-dependencies',
	title: 'Pinned Dependency Versions',
	severity: 'warn',
	weight: 1,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies } = normalizeContext(ctx)
		const allEntries = [...Object.entries(dependencies), ...Object.entries(devDependencies)]

		const unpinned = allEntries
			.filter(([, version]) => typeof version === 'string' && (version.trim() === '*' || version.trim() === 'latest'))
			.map(([pkg]) => pkg)

		if (unpinned.length > 0) {
			return {
				status: 'warn',
				message: `Unpinned dependencies detected using '*' or 'latest': ${unpinned.join(', ')}.`,
				fix: {
					description: `Pin ${unpinned[0]} to a specific version or semver range in package.json.`,
					snippet: `"${unpinned[0]}": "^1.0.0"`,
				},
			}
		}

		return {
			status: 'pass',
			message: 'All dependencies use pinned or bounded version ranges.',
			fix: null,
		}
	},
}

module.exports = rule
