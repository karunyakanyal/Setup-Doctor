const { normalizeContext } = require('./utils')

const rule = {
	id: 'monorepo',
	title: 'Monorepo Structure',
	severity: 'info',
	weight: 0,
	category: 'structure',
	check(ctx) {
		const { filePaths, packageJson } = normalizeContext(ctx)
		const hasWorkspaceYaml = filePaths.has('pnpm-workspace.yaml') || [...filePaths].some((p) => typeof p === 'string' && p.split('/').pop() === 'pnpm-workspace.yaml')
		const hasLerna = filePaths.has('lerna.json') || [...filePaths].some((p) => typeof p === 'string' && p.split('/').pop() === 'lerna.json')
		const hasWorkspaces = Boolean(packageJson && packageJson.workspaces)

		if (hasWorkspaceYaml || hasLerna || hasWorkspaces) {
			return {
				status: 'info',
				message: 'Monorepo detected; only the root package.json was analyzed.',
				fix: null,
			}
		}

		return {
			status: 'pass',
			message: 'Single project repository structure detected.',
			fix: null,
		}
	},
}

module.exports = rule
