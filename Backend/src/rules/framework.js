function detectFramework(packageJson = {}) {
	const deps = {
		...(packageJson?.dependencies || {}),
		...(packageJson?.devDependencies || {}),
	}

	if (deps.next) return 'next'
	if (deps.vue) return 'vue'
	if (deps.react) return 'react'
	if (deps.express) return 'express'
	if (deps.vite) return 'vite'
	return 'node'
}

module.exports = {
	detectFramework,
}
