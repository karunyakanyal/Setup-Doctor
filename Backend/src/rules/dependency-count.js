const { normalizeContext } = require('./utils')

const rule = {
	id: 'dependency-count',
	title: 'Dependency Count',
	severity: 'info',
	weight: 0,
	category: 'dependencies',
	check(ctx) {
		const { dependencies, devDependencies, filePaths, packageJson } = normalizeContext(ctx)
		const prodCount = Object.keys(dependencies).length
		const devCount = Object.keys(devDependencies).length

		const isMonorepo = Boolean(
			filePaths.has('pnpm-workspace.yaml') ||
			filePaths.has('lerna.json') ||
			(packageJson && packageJson.workspaces) ||
			[...filePaths].some((p) => typeof p === 'string' && (p.split('/').pop() === 'pnpm-workspace.yaml' || p.split('/').pop() === 'lerna.json'))
		)

		const suffix = isMonorepo
			? ' (monorepo detected; only the root package.json was analyzed)'
			: ''

		return {
			status: 'info',
			message: `${prodCount} production dependencies and ${devCount} development dependencies are configured${suffix}.`,
			fix: null,
		}
	},
}

module.exports = rule
