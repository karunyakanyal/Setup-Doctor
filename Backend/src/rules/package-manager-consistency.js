const { normalizeContext, formatList } = require('./utils')

const rule = {
	id: 'package-manager-consistency',
	title: 'Package Manager Consistency',
	severity: 'warn',
	weight: 1,
	category: 'config',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].filter((fileName) => filePaths.has(fileName))
		const packageManagers = lockfiles.map((fileName) => ({
			'package-lock.json': 'npm',
			'yarn.lock': 'Yarn',
			'pnpm-lock.yaml': 'pnpm',
		}[fileName]))

		if (lockfiles.length === 1) {
			return {
				status: 'pass',
				message: `${packageManagers[0]} package manager lockfile is present.`,
				fix: null,
			}
		}

		if (lockfiles.length > 1) {
			return {
				status: 'warn',
				message: `Multiple package manager lockfiles were found: ${formatList(lockfiles, 3)}.`,
				fix: {
					description: 'Delete extraneous lockfiles to prevent conflicting dependency resolution.',
					command: 'git rm yarn.lock',
				},
			}
		}

		return {
			status: 'warn',
			message: 'No supported package manager lockfile was found.',
			fix: {
				description: 'Generate a standard lockfile using npm install.',
				command: 'npm install',
			},
		}
	},
}

module.exports = rule
