const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
	allRules,
	rulesMap,
	calculateHealthScore,
	calculateGrade,
	calculateCategoryScores,
	detectFramework,
	runDiagnostics,
} = require('./index')

// 1. Tests for detectFramework
test('detectFramework: detects frameworks according to dependencies precedence', () => {
	assert.equal(detectFramework({ dependencies: { next: '14.0.0', react: '18.0.0' } }), 'next')
	assert.equal(detectFramework({ dependencies: { vue: '3.0.0' } }), 'vue')
	assert.equal(detectFramework({ dependencies: { react: '19.0.0' } }), 'react')
	assert.equal(detectFramework({ dependencies: { express: '5.0.0' } }), 'express')
	assert.equal(detectFramework({ devDependencies: { vite: '5.0.0' } }), 'vite')
	assert.equal(detectFramework({ dependencies: { lodash: '4.17.21' } }), 'node')
	assert.equal(detectFramework({}), 'node')
	assert.equal(detectFramework(null), 'node')
})

// 2. Tests for Grade Boundaries
test('calculateGrade: adheres to strict grade boundaries', () => {
	// A >= 90
	assert.equal(calculateGrade(100), 'A')
	assert.equal(calculateGrade(90), 'A')

	// B >= 80
	assert.equal(calculateGrade(89), 'B')
	assert.equal(calculateGrade(80), 'B')

	// C >= 70
	assert.equal(calculateGrade(79), 'C')
	assert.equal(calculateGrade(70), 'C')

	// D >= 60
	assert.equal(calculateGrade(69), 'D')
	assert.equal(calculateGrade(60), 'D')

	// F < 60
	assert.equal(calculateGrade(59), 'F')
	assert.equal(calculateGrade(40), 'F')
	assert.equal(calculateGrade(0), 'F')
})

// 3. Tests for Category Scores
test('calculateCategoryScores: computes scores per category and handles clean categories', () => {
	const diagnostics = [
		{ rule: 'package-json', category: 'structure', status: 'pass' },
		{ rule: 'lockfile', category: 'structure', status: 'warning' },
		{ rule: 'dependencies', category: 'dependencies', status: 'pass' },
		{ rule: 'duplicate-dependencies', category: 'dependencies', status: 'error' },
		{ rule: 'scripts', category: 'config', status: 'pass' },
		{ rule: 'missing-test-script', category: 'testing', status: 'warning' },
		{ rule: 'environment-file-safety', category: 'security', status: 'pass' },
		{ rule: 'readme', category: 'docs', status: 'pass' },
	]

	const scores = calculateCategoryScores(diagnostics)

	// structure: 1 pass (100) + 1 warn (50) -> 150/2 = 75
	assert.equal(scores.structure, 75)
	// dependencies: 1 pass (100) + 1 error (0) -> 100/2 = 50
	assert.equal(scores.dependencies, 50)
	// config: 1 pass (100) -> 100
	assert.equal(scores.config, 100)
	// testing: 1 warn (50) -> 50
	assert.equal(scores.testing, 50)
	// security: 1 pass (100) -> 100
	assert.equal(scores.security, 100)
	// docs: 1 pass (100) -> 100
	assert.equal(scores.docs, 100)
})

// 4. Test score ignores info
test("calculateHealthScore: ignores 'info' diagnostics completely", () => {
	const passDiagnostic = { ruleId: 'package-json', status: 'pass' }
	const infoDiagnostic = { ruleId: 'dependency-count', status: 'info' }
	const truncationInfo = { ruleId: 'tree-truncation', status: 'info' }

	const scoreOnlyPass = calculateHealthScore([passDiagnostic])
	const scoreWithInfo = calculateHealthScore([passDiagnostic, infoDiagnostic, truncationInfo])

	assert.equal(scoreOnlyPass.score, 100)
	assert.equal(scoreWithInfo.score, 100)
	assert.equal(scoreWithInfo.status, 'Healthy')
	assert.equal(scoreWithInfo.grade, 'A')
})

// 5. Passing and failing tests for EVERY rule in allRules
test('allRules: exports required structure and valid categories', () => {
	const validCategories = new Set(['structure', 'dependencies', 'config', 'testing', 'security', 'docs'])
	for (const rule of allRules) {
		assert.ok(rule.id, 'rule must have id')
		assert.ok(rule.title, `rule ${rule.id} must have title`)
		assert.ok(rule.severity, `rule ${rule.id} must have severity`)
		assert.ok(typeof rule.weight === 'number', `rule ${rule.id} must have numeric weight`)
		assert.ok(validCategories.has(rule.category), `rule ${rule.id} category ${rule.category} must be valid`)
		assert.equal(typeof rule.check, 'function', `rule ${rule.id} check must be function`)
	}
})

// 1. package-json
test('rule: package-json evaluates passing and failing cases', () => {
	const rule = rulesMap['package-json']
	const pass = rule.check({ packageJson: { name: 'my-app', version: '1.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ packageJson: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
	assert.ok(fail.fix.command || fail.fix.snippet)
})

// 2. scripts
test('rule: scripts evaluates passing and failing cases', () => {
	const rule = rulesMap['scripts']
	const pass = rule.check({ scripts: { build: 'vite build' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ scripts: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 3. build-script
test('rule: build-script evaluates passing and failing cases', () => {
	const rule = rulesMap['build-script']
	const pass = rule.check({ scripts: { build: 'vite build' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ scripts: { dev: 'vite' } })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 4. dev-script
test('rule: dev-script evaluates passing and failing cases', () => {
	const rule = rulesMap['dev-script']
	const pass = rule.check({ scripts: { dev: 'vite' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ scripts: { build: 'vite build' } })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 5. dependencies
test('rule: dependencies evaluates passing and failing cases', () => {
	const rule = rulesMap['dependencies']
	const pass = rule.check({ dependencies: { express: '^5.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ dependencies: {}, devDependencies: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 6. node-engine
test('rule: node-engine evaluates passing and failing cases', () => {
	const rule = rulesMap['node-engine']
	const pass = rule.check({ engines: { node: '>=20.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ engines: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 7. dependency-count
test('rule: dependency-count returns info status', () => {
	const rule = rulesMap['dependency-count']
	const res = rule.check({ dependencies: { express: '5.0.0' }, devDependencies: { nodemon: '3.0.0' } })
	assert.equal(res.status, 'info')
	assert.equal(res.fix, null)

	const zeroRes = rule.check({})
	assert.equal(zeroRes.status, 'info')
	assert.equal(zeroRes.fix, null)
})

// 8. duplicate-dependencies
test('rule: duplicate-dependencies evaluates passing and failing cases', () => {
	const rule = rulesMap['duplicate-dependencies']
	const pass = rule.check({
		dependencies: { react: '^19.0.0' },
		devDependencies: { nodemon: '^3.0.0' },
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		dependencies: { typescript: '^5.0.0' },
		devDependencies: { typescript: '^5.0.0' },
	})
	assert.equal(fail.status, 'fail')
	assert.ok(fail.fix)
})

// 9. dependency-version-validity
test('rule: dependency-version-validity evaluates passing and failing cases', () => {
	const rule = rulesMap['dependency-version-validity']
	const pass = rule.check({ dependencies: { react: '^19.0.0', express: '>=5.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ dependencies: { bad: 'not-valid-semver-range!!' } })
	assert.equal(fail.status, 'fail')
	assert.ok(fail.fix)
})

// 10. tree-truncation
test('rule: tree-truncation evaluates passing and truncated cases', () => {
	const rule = rulesMap['tree-truncation']
	const pass = rule.check({ treeData: { truncated: false } })
	assert.equal(pass.status, 'pass')

	const fail = rule.check({ treeData: { truncated: true } })
	assert.equal(fail.status, 'info')
})

// 11. react-version-consistency
test('rule: react-version-consistency evaluates passing and failing cases', () => {
	const rule = rulesMap['react-version-consistency']
	const pass = rule.check({
		dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		dependencies: { react: '^19.0.0', 'react-dom': '^18.2.0' },
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 12. lockfile
test('rule: lockfile evaluates passing and failing cases', () => {
	const rule = rulesMap['lockfile']
	const pass = rule.check({ filePaths: ['package-lock.json'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 13. package-manager-consistency
test('rule: package-manager-consistency evaluates passing and failing cases', () => {
	const rule = rulesMap['package-manager-consistency']
	const pass = rule.check({ filePaths: ['package-lock.json'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: ['package-lock.json', 'yarn.lock'] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 14. readme
test('rule: readme evaluates passing and failing cases', () => {
	const rule = rulesMap['readme']
	const pass = rule.check({ filePaths: ['README.md'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 15. gitignore
test('rule: gitignore evaluates passing and failing cases', () => {
	const rule = rulesMap['gitignore']
	const pass = rule.check({ filePaths: ['.gitignore'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 16. react-dependencies
test('rule: react-dependencies evaluates passing and failing cases', () => {
	const rule = rulesMap['react-dependencies']
	const pass = rule.check({ dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ dependencies: { react: '^19.0.0' } })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 17. vite-dependency
test('rule: vite-dependency evaluates passing and failing cases', () => {
	const rule = rulesMap['vite-dependency']
	const pass = rule.check({
		devDependencies: { vite: '^5.0.0' },
		filePaths: ['vite.config.js'],
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		devDependencies: {},
		filePaths: ['vite.config.js'],
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 18. eslint-dependency
test('rule: eslint-dependency evaluates passing and failing cases', () => {
	const rule = rulesMap['eslint-dependency']
	const pass = rule.check({
		devDependencies: { eslint: '^9.0.0' },
		filePaths: ['eslint.config.js'],
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		devDependencies: {},
		filePaths: ['eslint.config.js'],
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 19. typescript-dependency
test('rule: typescript-dependency evaluates passing and failing cases', () => {
	const rule = rulesMap['typescript-dependency']
	const pass = rule.check({
		devDependencies: { typescript: '^5.0.0' },
		filePaths: ['tsconfig.json'],
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		devDependencies: {},
		filePaths: ['tsconfig.json'],
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 20. environment-example
test('rule: environment-example evaluates passing and failing cases', () => {
	const rule = rulesMap['environment-example']
	const pass = rule.check({ filePaths: ['.env.example'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 21. environment-file-safety
test('rule: environment-file-safety evaluates passing and failing cases', () => {
	const rule = rulesMap['environment-file-safety']
	const pass = rule.check({ filePaths: ['src/app.js', 'package.json'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: ['.env', 'package.json'] })
	assert.equal(fail.status, 'fail')
	assert.ok(fail.fix)
})

// 22. environment-documentation
test('rule: environment-documentation evaluates passing and failing cases', () => {
	const rule = rulesMap['environment-documentation']
	const pass = rule.check({ filePaths: ['.env.example'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: ['.env'] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 23. missing-readme
test('rule: missing-readme evaluates passing and failing cases', () => {
	const rule = rulesMap['missing-readme']
	const pass = rule.check({ filePaths: ['README.md'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 24. missing-license
test('rule: missing-license evaluates passing and failing cases', () => {
	const rule = rulesMap['missing-license']
	const pass = rule.check({ filePaths: ['LICENSE'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [], packageJson: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 25. missing-test-script
test('rule: missing-test-script evaluates passing and failing cases', () => {
	const rule = rulesMap['missing-test-script']
	const pass = rule.check({ scripts: { test: 'node --test' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ scripts: {} })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 26. missing-ci-config
test('rule: missing-ci-config evaluates passing and failing cases', () => {
	const rule = rulesMap['missing-ci-config']
	const pass = rule.check({ filePaths: ['.github/workflows/ci.yml'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 27. gitignore-essentials
test('rule: gitignore-essentials evaluates passing and failing cases', () => {
	const rule = rulesMap['gitignore-essentials']
	const pass = rule.check({ filePaths: ['.gitignore', 'src/server.js'] })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ filePaths: ['.gitignore', 'node_modules/pkg/index.js'] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 28. unpinned-dependencies
test('rule: unpinned-dependencies evaluates passing and failing cases', () => {
	const rule = rulesMap['unpinned-dependencies']
	const pass = rule.check({ dependencies: { express: '^5.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ dependencies: { express: 'latest' } })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 29. missing-nvmrc-or-engines
test('rule: missing-nvmrc-or-engines evaluates passing and failing cases', () => {
	const rule = rulesMap['missing-nvmrc-or-engines']
	const pass = rule.check({ engines: { node: '>=20.0.0' } })
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({ engines: {}, filePaths: [] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 30. react-dom-version-match (framework-specific)
test('rule: react-dom-version-match evaluates passing and failing cases', () => {
	const rule = rulesMap['react-dom-version-match']
	const pass = rule.check({
		framework: 'react',
		dependencies: { react: '19.0.0', 'react-dom': '19.0.0' },
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		framework: 'react',
		dependencies: { react: '19.0.0', 'react-dom': '18.2.0' },
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// 31. express-start-script (framework-specific)
test('rule: express-start-script evaluates passing and failing cases', () => {
	const rule = rulesMap['express-start-script']
	const pass = rule.check({
		framework: 'express',
		scripts: { start: 'node src/server.js' },
	})
	assert.equal(pass.status, 'pass')
	assert.equal(pass.fix, null)

	const fail = rule.check({
		framework: 'express',
		scripts: {},
	})
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)
})

// Integration test for runDiagnostics
test('runDiagnostics: returns framework, grade, categoryScores, and diagnostics with ruleId and fix', () => {
	const packageJson = {
		name: 'my-express-app',
		dependencies: { express: '^5.0.0' },
		scripts: { start: 'node index.js', test: 'node --test' },
		engines: { node: '>=20.0.0' },
	}
	const treeData = {
		tree: [
			{ path: 'package.json', type: 'blob' },
			{ path: 'package-lock.json', type: 'blob' },
			{ path: 'README.md', type: 'blob' },
			{ path: '.gitignore', type: 'blob' },
			{ path: 'LICENSE', type: 'blob' },
			{ path: '.env.example', type: 'blob' },
			{ path: '.github/workflows/ci.yml', type: 'blob' },
		],
	}

	const result = runDiagnostics({ packageJson, treeData })

	assert.equal(result.framework, 'express')
	assert.ok(result.grade)
	assert.ok(result.categoryScores)
	assert.equal(typeof result.categoryScores.structure, 'number')
	assert.equal(typeof result.categoryScores.dependencies, 'number')
	assert.equal(typeof result.categoryScores.config, 'number')
	assert.equal(typeof result.categoryScores.testing, 'number')
	assert.equal(typeof result.categoryScores.security, 'number')
	assert.equal(typeof result.categoryScores.docs, 'number')

	for (const d of result.diagnostics) {
		assert.ok(d.ruleId, 'diagnostic must have ruleId')
		assert.ok(d.category, 'diagnostic must have category')
		assert.ok('fix' in d, 'diagnostic must have fix property')
	}
})
