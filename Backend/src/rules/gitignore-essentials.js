const { normalizeContext, isIgnoredPath, isCandidateEnvFile, formatList } = require('./utils')

const rule = {
	id: 'gitignore-essentials',
	title: 'Essential .gitignore Patterns',
	severity: 'warn',
	weight: 1,
	category: 'security',
	check(ctx) {
		const { filePaths } = normalizeContext(ctx)

		if (!filePaths.has('.gitignore')) {
			return {
				status: 'warn',
				message: '.gitignore is missing; node_modules, dist, and .env should be ignored.',
				fix: {
					description: 'Add a .gitignore file containing node_modules, dist, and .env.',
					snippet: 'node_modules/\ndist/\n.env',
				},
			}
		}

		const trackedUnwanted = [...filePaths].filter((path) => {
			if (typeof path !== 'string') return false
			const norm = path.replace(/\\/g, '/')
			const parts = norm.split('/').filter(Boolean)
			if (parts.length === 0) return false

			// 1. .env files: only candidate env files (root or depth <= 2, not ignored)
			if (parts[parts.length - 1] === '.env') {
				return isCandidateEnvFile(path)
			}

			// 2. node_modules: tracked node_modules files (not inside ignored test/fixture/doc/etc paths)
			const isNodeModules = parts.includes('node_modules')
			if (isNodeModules) {
				return !isIgnoredPath(path, { except: ['node_modules'] })
			}

			// 3. dist: tracked dist files (not inside ignored test/fixture/doc/etc paths)
			const isDist = parts.includes('dist')
			if (isDist) {
				return !isIgnoredPath(path)
			}

			return false
		})

		if (trackedUnwanted.length > 0) {
			const formattedList = formatList(trackedUnwanted, 3)
			return {
				status: 'warn',
				message: `Essential patterns are violated; unwanted files tracked: ${formattedList}.`,
				fix: {
					description: 'Add node_modules, dist, and .env to .gitignore and untrack existing files.',
					snippet: 'node_modules/\ndist/\n.env',
				},
			}
		}

		return {
			status: 'pass',
			message: 'Essential .gitignore items (node_modules, dist, .env) are properly respected.',
			fix: null,
		}
	},
}

module.exports = rule
