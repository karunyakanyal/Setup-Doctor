const { normalizeContext } = require('./utils')

const rule = {
	id: 'lockfile',
	title: 'Lockfile Presence',
	severity: 'warn',
	weight: 1,
	category: 'structure',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)
		const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].filter((fileName) => filePaths.has(fileName))

		if (lockfiles.length === 1) {
			return {
				status: 'pass',
				message: 'A package manager lockfile is present.',
				fix: null,
			}
		}

		if (lockfiles.length > 1) {
			return {
				status: 'warn',
				message: 'Multiple package manager lockfiles were found.',
				fix: {
					description: 'Remove redundant lockfiles and commit only one lockfile for the team package manager.',
					command: 'git rm yarn.lock',
				},
			}
		}

		return {
			status: 'warn',
			message: 'No package manager lockfile was found.',
			fix: {
				description: 'Generate and commit a package-lock.json by running npm install.',
				command: 'npm install',
			},
		}
	},
}

module.exports = rule
