const { normalizeContext, formatList } = require('./utils')

const rule = {
	id: 'duplicate-dependencies',
	title: 'Duplicate Dependencies',
	severity: 'error',
	weight: 1,
	category: 'dependencies',
	check(ctx, devDepsArg) {
		let deps = {}
		let devDeps = {}

		if (ctx && typeof ctx === 'object' && devDepsArg && typeof devDepsArg === 'object') {
			deps = ctx
			devDeps = devDepsArg
		} else {
			const norm = normalizeContext(ctx)
			deps = norm.dependencies
			devDeps = norm.devDependencies
		}

		const duplicates = Object.keys(deps).filter((name) =>
			Object.prototype.hasOwnProperty.call(devDeps, name),
		)

		if (duplicates.length > 0) {
			return {
				status: 'fail',
				message: `These dependencies are declared in both sections: ${formatList(duplicates, 3)}.`,
				fix: {
					description: `Remove duplicated package ${duplicates[0]} from devDependencies.`,
					command: `npm uninstall --save-dev ${duplicates[0]}`,
				},
			}
		}

		return {
			status: 'pass',
			message: 'No dependencies are duplicated between dependencies and devDependencies.',
			fix: null,
		}
	},
}

module.exports = rule
