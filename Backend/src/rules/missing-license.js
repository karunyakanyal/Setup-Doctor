const { normalizeContext } = require('./utils')

const rule = {
	id: 'missing-license',
	title: 'Repository License',
	severity: 'warn',
	weight: 1,
	category: 'docs',
	check(ctx) {
		const { filePaths, packageJson } = normalizeContext(ctx)
		const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE', 'license.md'].filter((fileName) => filePaths.has(fileName))
		const hasLicenseField = Boolean(packageJson.license && typeof packageJson.license === 'string' && packageJson.license.trim())

		if (licenseFiles.length > 0 || hasLicenseField) {
			return {
				status: 'pass',
				message: 'License is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Repository is missing a LICENSE file.',
			fix: {
				description: 'Add a LICENSE file (such as MIT) to the root of the repository.',
				snippet: 'MIT License\n\nCopyright (c) 2026',
			},
		}
	},
}

module.exports = rule
