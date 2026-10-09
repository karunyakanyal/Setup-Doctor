const { normalizeContext } = require('./utils')

const rule = {
	id: 'package-json',
	title: 'package.json Configuration',
	severity: 'warn',
	weight: 1,
	category: 'structure',
	check(ctx) {
		const { packageJson, filePaths } = normalizeContext(ctx)
		const exists = Object.keys(packageJson).length > 0 || (filePaths.size > 0 && filePaths.has('package.json'))

		if (exists) {
			return {
				status: 'pass',
				message: 'package.json exists.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'package.json is missing or empty.',
			fix: {
				description: 'Initialize a package.json file with npm init.',
				command: 'npm init -y',
			},
		}
	},
}

module.exports = rule
