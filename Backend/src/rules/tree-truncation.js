const rule = {
	id: 'tree-truncation',
	title: 'Tree Truncation Status',
	severity: 'info',
	weight: 0,
	category: 'structure',
	check(ctx) {
		const treeData = (ctx && ctx.treeData) || ctx || {}
		const isTruncated = Boolean(treeData.truncated)

		if (isTruncated) {
			return {
				status: 'info',
				message: 'Repository tree truncated; results may be incomplete.',
				fix: null,
			}
		}

		return {
			status: 'pass',
			message: 'Complete repository file tree analyzed.',
			fix: null,
		}
	},
}

module.exports = rule
