const { normalizeContext } = require('./utils')

const rule = {
	id: 'missing-test-script',
	title: 'Test Script Configuration',
	severity: 'warn',
	weight: 1,
	category: 'testing',
	check(ctx) {
		const { scripts } = normalizeContext(ctx)
		const testScript = scripts.test

		const hasTestScript = Boolean(
			testScript &&
			typeof testScript === 'string' &&
			!testScript.includes('no test specified'),
		)

		if (hasTestScript) {
			return {
				status: 'pass',
				message: 'Test script is configured.',
				fix: null,
			}
		}

		return {
			status: 'warn',
			message: 'Test script is missing in package.json.',
			fix: {
				description: 'Add a test script to package.json to run automated tests.',
				snippet: '"test": "node --test"',
			},
		}
	},
}

module.exports = rule
