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
	isIgnoredPath,
	isValidDependencyVersion,
	formatList,
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

test('rule: node-engine recommends compatible range and explains compatibility declaration', () => {
	const rule = rulesMap['node-engine']
	// 1. Unknown compatibility does not blindly prescribe Node 20
	const failUnknown = rule.check({ engines: {} })
	assert.equal(failUnknown.status, 'warn')
	assert.doesNotMatch(failUnknown.fix.snippet, />=20\.0\.0/)
	assert.match(failUnknown.fix.snippet, />=22 <25/)
	assert.match(failUnknown.fix.description, /compatibility/)
	assert.match(failUnknown.fix.description, /does not install or switch/)
	assert.match(failUnknown.fix.description, /\.nvmrc/)

	// 2. Detected runtime configuration (e.g. @types/node) is respected
	const failWithTypes = rule.check({
		devDependencies: { '@types/node': '^22.5.0' },
	})
	assert.equal(failWithTypes.status, 'warn')
	assert.match(failWithTypes.fix.snippet, />=22\.0\.0/)
	assert.match(failWithTypes.fix.description, /22/)

	// 3. Explicit nodeVersion in context
	const failWithRuntime = rule.check({ nodeVersion: '23.0.0' })
	assert.equal(failWithRuntime.status, 'warn')
	assert.match(failWithRuntime.fix.snippet, />=23\.0\.0/)
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

	const fail = rule.check({ filePaths: ['.env'] })
	assert.equal(fail.status, 'warn')
	assert.ok(fail.fix)

	const info = rule.check({ filePaths: [] })
	assert.equal(info.status, 'info')
	assert.equal(info.message, '.env.example not needed; no environment usage detected.')
	assert.equal(info.fix, null)
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

test('rule: missing-nvmrc-or-engines respects detected Node 18, Node 20, or unknown runtime', () => {
	const rule = rulesMap['missing-nvmrc-or-engines']

	// 1. Detected Node 18 via @types/node
	const res18 = rule.check({
		devDependencies: { '@types/node': '^18.11.0' },
		filePaths: [],
	})
	assert.equal(res18.status, 'warn')
	assert.match(res18.fix.snippet, />=18\.0\.0/)
	assert.doesNotMatch(res18.fix.snippet, />=22 <25/)
	assert.match(res18.fix.description, /18/)
	assert.match(res18.fix.description, /detected runtime configuration/)

	// 2. Detected Node 20 via volta.node
	const res20 = rule.check({
		packageJson: { volta: { node: '20.10.0' } },
		filePaths: [],
	})
	assert.equal(res20.status, 'warn')
	assert.match(res20.fix.snippet, />=20\.0\.0/)
	assert.doesNotMatch(res20.fix.snippet, />=22 <25/)
	assert.match(res20.fix.description, /20/)
	assert.match(res20.fix.description, /detected runtime configuration/)

	// 3. Unknown runtime provides conservative illustrative guidance
	const resUnknown = rule.check({
		packageJson: {},
		filePaths: [],
	})
	assert.equal(resUnknown.status, 'warn')
	assert.match(resUnknown.fix.snippet, />=22 <25/)
	assert.match(resUnknown.fix.description, /illustrative example/i)
	assert.match(resUnknown.fix.description, /compatibility/i)
})

test('rule: missing-ci-config respects detected Node version or provides illustrative disclaimer', () => {
	const rule = rulesMap['missing-ci-config']

	const withNode18 = rule.check({
		devDependencies: { '@types/node': '^18.0.0' },
		filePaths: [],
	})
	assert.equal(withNode18.status, 'warn')
	assert.match(withNode18.fix.snippet, /node-version:\s*18/)
	assert.match(withNode18.fix.description, /detected Node\.js runtime version \(18\)/)

	const withNode20 = rule.check({
		packageJson: { volta: { node: '20.10.0' } },
		filePaths: [],
	})
	assert.equal(withNode20.status, 'warn')
	assert.match(withNode20.fix.snippet, /node-version:\s*20/)
	assert.match(withNode20.fix.description, /detected Node\.js runtime version \(20\)/)

	const unknownNode = rule.check({ filePaths: [] })
	assert.equal(unknownNode.status, 'warn')
	assert.match(unknownNode.fix.snippet, /node-version:\s*22/)
	assert.match(unknownNode.fix.description, /illustrative/i)
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

// 32. isIgnoredPath and formatList helpers
test('isIgnoredPath: matches all required segments and formatList caps at 3 with "and N more"', () => {
	const segments = [
		'__tests__',
		'__fixtures__',
		'fixtures',
		'fixture',
		'test',
		'tests',
		'e2e',
		'examples',
		'example',
		'playground',
		'samples',
		'docs',
		'node_modules',
	]

	for (const seg of segments) {
		assert.equal(isIgnoredPath(`packages/app/${seg}/file.js`), true, `must match ${seg}`)
		assert.equal(isIgnoredPath(`${seg}/nested/.env`), true, `must match ${seg} at root`)
	}

	assert.equal(isIgnoredPath('src/components/Header.jsx'), false)
	assert.equal(isIgnoredPath('packages/web/src/index.js'), false)
	assert.equal(isIgnoredPath(''), false)
	assert.equal(isIgnoredPath(null), false)

	// formatList
	assert.equal(formatList(['a']), 'a')
	assert.equal(formatList(['a', 'b']), 'a, b')
	assert.equal(formatList(['a', 'b', 'c']), 'a, b, c')
	assert.equal(formatList(['a', 'b', 'c', 'd']), 'a, b, c and 1 more')
	assert.equal(formatList(['a', 'b', 'c', 'd', 'e', 'f']), 'a, b, c and 3 more')
})

// 33. Fixture-path cases for environment rules and gitignore-essentials
test('fixture-path cases: ignored paths and depth > 2 are not reported', () => {
	const envSafetyRule = rulesMap['environment-file-safety']
	const envDocRule = rulesMap['environment-documentation']
	const gitignoreEssentialsRule = rulesMap['gitignore-essentials']

	// Environment file safety: fixture paths must pass
	const fixtureEnvPass = envSafetyRule.check({
		filePaths: [
			'test/fixtures/.env',
			'packages/app/__tests__/.env',
			'docs/.env',
			'examples/demo/.env',
			'playground/.env',
			'node_modules/pkg/.env',
			'packages/sub/deep/nested/.env', // depth 4 > 2
		],
	})
	assert.equal(fixtureEnvPass.status, 'pass')

	// Environment file safety: root .env and packages/x/.env (depth <= 2) must fail
	const rootEnvFail = envSafetyRule.check({ filePaths: ['.env'] })
	assert.equal(rootEnvFail.status, 'fail')
	assert.match(rootEnvFail.message, /\.env/)

	const depth2EnvFail = envSafetyRule.check({ filePaths: ['packages/ui/.env'] })
	assert.equal(depth2EnvFail.status, 'fail')
	assert.match(depth2EnvFail.message, /packages\/ui\/\.env/)

	// Environment documentation: fixture .env without .env.example should not complain
	const fixtureDocPass = envDocRule.check({
		filePaths: ['test/fixtures/.env', 'docs/.env'],
	})
	assert.equal(fixtureDocPass.status, 'pass')
	assert.equal(fixtureDocPass.message, 'No environment configuration was detected.')

	// gitignore-essentials: fixture node_modules, dist, and .env must pass
	const fixtureGitignorePass = gitignoreEssentialsRule.check({
		filePaths: [
			'.gitignore',
			'test/fixtures/node_modules/pkg/index.js',
			'docs/dist/main.js',
			'examples/demo/.env',
			'playground/dist/bundle.js',
		],
	})
	assert.equal(fixtureGitignorePass.status, 'pass')

	// gitignore-essentials: long message formats "and N more"
	const manyUnwanted = gitignoreEssentialsRule.check({
		filePaths: [
			'.gitignore',
			'node_modules/a/index.js',
			'node_modules/b/index.js',
			'dist/bundle.js',
			'.env',
		],
	})
	assert.equal(manyUnwanted.status, 'warn')
	assert.match(manyUnwanted.message, /and 1 more/)
})

// 34. Pnpm-protocol and version validation cases
test('pnpm-protocol and version validation cases: protocols, dist-tags, git urls are accepted', () => {
	const versionRule = rulesMap['dependency-version-validity']

	// All accepted formats
	const validDeps = {
		'pkg-workspace': 'workspace:*',
		'pkg-workspace-caret': 'workspace:^1.2.3',
		'pkg-catalog': 'catalog:default',
		'pkg-npm': 'npm:react@^18.0.0',
		'pkg-link': 'link:../other-package',
		'pkg-file': 'file:./local-package',
		'pkg-portal': 'portal:../portal-package',
		'pkg-git': 'git+https://github.com/user/repo.git#main',
		'pkg-https': 'https://github.com/user/repo/tarball/v1.0.0',
		'pkg-shorthand': 'facebook/react#v18.0.0',
		'pkg-latest': 'latest',
		'pkg-next': 'next',
		'pkg-beta': 'beta',
		'pkg-canary': 'canary',
		'pkg-semver': '^18.2.0',
	}

	assert.equal(versionRule.check({ dependencies: validDeps }).status, 'pass')

	// Empty and malformed versions must fail
	assert.equal(versionRule.check({ dependencies: { bad: '' } }).status, 'fail')
	assert.equal(versionRule.check({ dependencies: { bad: '   ' } }).status, 'fail')
	assert.equal(versionRule.check({ dependencies: { bad: 'not a valid version!@#' } }).status, 'fail')
	assert.equal(versionRule.check({ dependencies: { bad: '>>>' } }).status, 'fail')
})

// 35. Monorepo detection cases
test('monorepo detection: pnpm-workspace.yaml, lerna.json, and workspaces trigger monorepo mode', () => {
	const monorepoRule = rulesMap['monorepo']
	const depCountRule = rulesMap['dependency-count']

	// Rule check: pnpm-workspace.yaml
	assert.equal(monorepoRule.check({ filePaths: ['pnpm-workspace.yaml'] }).status, 'info')
	// Rule check: lerna.json
	assert.equal(monorepoRule.check({ filePaths: ['lerna.json'] }).status, 'info')
	// Rule check: workspaces in package.json
	assert.equal(monorepoRule.check({ packageJson: { workspaces: ['packages/*'] } }).status, 'info')
	// Single repo check
	assert.equal(monorepoRule.check({ filePaths: ['package.json'] }).status, 'pass')

	// Dependency count: does not contain monorepo sentence
	const monorepoCount = depCountRule.check({
		dependencies: { react: '^18.0.0' },
		devDependencies: { vite: '^5.0.0' },
		filePaths: ['pnpm-workspace.yaml'],
	})
	assert.equal(monorepoCount.status, 'info')
	assert.doesNotMatch(monorepoCount.message, /monorepo/)
	assert.doesNotMatch(monorepoCount.message, /only the root package\.json was analyzed/)
	assert.equal(monorepoCount.message, '1 production dependencies and 1 development dependencies are configured.')

	const singleCount = depCountRule.check({
		dependencies: { react: '^18.0.0' },
		devDependencies: { vite: '^5.0.0' },
		filePaths: ['package.json'],
	})
	assert.equal(singleCount.status, 'info')
	assert.doesNotMatch(singleCount.message, /monorepo/)

	// runDiagnostics: returns monorepo: true and monorepo info diagnostic
	const monorepoDiag = runDiagnostics({
		packageJson: { name: 'monorepo-root', workspaces: ['packages/*'] },
		treeData: { tree: [{ path: 'package.json', type: 'blob' }] },
	})
	assert.equal(monorepoDiag.monorepo, true)
	const monoInfo = monorepoDiag.diagnostics.find((d) => d.ruleId === 'monorepo')
	assert.ok(monoInfo, 'must include monorepo diagnostic')
	assert.equal(monoInfo.message, 'Monorepo detected; only the root package.json was analyzed.')
	assert.equal(monoInfo.status, 'info')
	assert.equal(monoInfo.level, 'info')

	// runDiagnostics: single repo returns monorepo: false without monorepo diagnostic
	const singleDiag = runDiagnostics({
		packageJson: { name: 'single-app' },
		treeData: { tree: [{ path: 'package.json', type: 'blob' }] },
	})
	assert.equal(singleDiag.monorepo, false)
	assert.equal(singleDiag.diagnostics.find((d) => d.ruleId === 'monorepo'), undefined)
})

// 36. Health label follows grade (A: Healthy, B: Good, C: Needs Attention, D/F: At Risk)
test('calculateHealthScore: health status and label follow the letter grade', () => {
	// Grade A (>= 90): Healthy
	const healthA = calculateHealthScore([
		{ rule: 'package-json', status: 'pass' },
	])
	assert.equal(healthA.grade, 'A')
	assert.equal(healthA.status, 'Healthy')
	assert.equal(healthA.label, 'Healthy')

	// Grade B (>= 80): Good
	const healthB = calculateHealthScore([
		{ rule: 'r1', status: 'pass' },
		{ rule: 'r2', status: 'pass' },
		{ rule: 'r3', status: 'pass' },
		{ rule: 'r4', status: 'pass' },
		{ rule: 'r5', status: 'pass' },
		{ rule: 'r6', status: 'pass' },
		{ rule: 'r7', status: 'pass' },
		{ rule: 'r8', status: 'warning' },
		{ rule: 'r9', status: 'warning' },
		{ rule: 'r10', status: 'warning' },
	])
	assert.equal(healthB.grade, 'B')
	assert.equal(healthB.status, 'Good')
	assert.equal(healthB.label, 'Good')

	// Grade C (>= 70): Needs Attention
	const healthC = calculateHealthScore([
		{ rule: 'r1', status: 'pass' },
		{ rule: 'r2', status: 'pass' },
		{ rule: 'r3', status: 'pass' },
		{ rule: 'r4', status: 'pass' },
		{ rule: 'r5', status: 'pass' },
		{ rule: 'r6', status: 'warning' },
		{ rule: 'r7', status: 'warning' },
		{ rule: 'r8', status: 'warning' },
		{ rule: 'r9', status: 'warning' },
		{ rule: 'r10', status: 'warning' },
	])
	assert.equal(healthC.grade, 'C')
	assert.equal(healthC.status, 'Needs Attention')
	assert.equal(healthC.label, 'Needs Attention')

	// Grade D (>= 60): At Risk
	const healthD = calculateHealthScore([
		{ rule: 'r1', status: 'pass' },
		{ rule: 'r2', status: 'pass' },
		{ rule: 'r3', status: 'pass' },
		{ rule: 'r4', status: 'warning' },
		{ rule: 'r5', status: 'warning' },
		{ rule: 'r6', status: 'warning' },
		{ rule: 'r7', status: 'warning' },
		{ rule: 'r8', status: 'warning' },
		{ rule: 'r9', status: 'warning' },
		{ rule: 'r10', status: 'warning' },
	])
	assert.equal(healthD.grade, 'D')
	assert.equal(healthD.status, 'At Risk')
	assert.equal(healthD.label, 'At Risk')

	// Grade F (< 60): At Risk
	const healthF = calculateHealthScore([
		{ rule: 'r1', status: 'error' },
	])
	assert.equal(healthF.grade, 'F')
	assert.equal(healthF.status, 'At Risk')
	assert.equal(healthF.label, 'At Risk')
})

// 37. .env.example rule consistency and env usage detection
test('.env.example and environment-documentation consistency and env usage detection', () => {
	const envExampleRule = rulesMap['environment-example']
	const envDocRule = rulesMap['environment-documentation']

	// Case 1: .env.example is present -> both pass
	const passCtx = { filePaths: ['.env.example', 'src/index.js'] }
	assert.equal(envExampleRule.check(passCtx).status, 'pass')
	assert.equal(envDocRule.check(passCtx).status, 'pass')

	// Case 2: No env usage detected -> .env.example is info, env-doc is pass (no contradiction)
	const noEnvCtx = {
		filePaths: ['package.json', 'README.md', 'src/server.js'],
		dependencies: { express: '^4.18.2' },
		scripts: { start: 'node src/server.js' },
	}
	const noEnvEx = envExampleRule.check(noEnvCtx)
	assert.equal(noEnvEx.status, 'info')
	assert.equal(noEnvEx.message, '.env.example not needed; no environment usage detected.')
	assert.equal(noEnvEx.fix, null)

	const noEnvDoc = envDocRule.check(noEnvCtx)
	assert.equal(noEnvDoc.status, 'pass')
	assert.equal(noEnvDoc.message, 'No environment configuration was detected.')

	// Case 3: Real .env at root -> both warn
	const realEnvCtx = {
		filePaths: ['.env', 'package.json', 'src/server.js'],
	}
	const realEnvEx = envExampleRule.check(realEnvCtx)
	assert.equal(realEnvEx.status, 'warn')
	assert.ok(realEnvEx.fix)

	const realEnvDoc = envDocRule.check(realEnvCtx)
	assert.equal(realEnvDoc.status, 'warn')
	assert.equal(realEnvDoc.message, '.env is present without .env.example documentation.')

	// Case 4: Real .env at depth <= 2 -> both warn
	const depth2Ctx = {
		filePaths: ['packages/backend/.env', 'package.json'],
	}
	assert.equal(envExampleRule.check(depth2Ctx).status, 'warn')
	assert.equal(envDocRule.check(depth2Ctx).status, 'warn')

	// Case 5: Dependencies like dotenv -> both warn
	const dotenvCtx = {
		filePaths: ['package.json'],
		dependencies: { dotenv: '^16.4.5' },
	}
	const dotenvEx = envExampleRule.check(dotenvCtx)
	assert.equal(dotenvEx.status, 'warn')
	assert.ok(dotenvEx.fix)

	const dotenvDoc = envDocRule.check(dotenvCtx)
	assert.equal(dotenvDoc.status, 'warn')

	// Case 6: Dev dependencies like cross-env -> both warn
	const crossEnvCtx = {
		filePaths: ['package.json'],
		devDependencies: { 'cross-env': '^7.0.3' },
	}
	assert.equal(envExampleRule.check(crossEnvCtx).status, 'warn')
	assert.equal(envDocRule.check(crossEnvCtx).status, 'warn')

	// Case 7: Env-reading scripts (e.g. --env-file) -> both warn
	const scriptCtx = {
		filePaths: ['package.json'],
		scripts: { dev: 'node --env-file=.env src/index.js' },
	}
	assert.equal(envExampleRule.check(scriptCtx).status, 'warn')
	assert.equal(envDocRule.check(scriptCtx).status, 'warn')

	// Case 8: Fixture-only .env does not count as env usage -> info / pass
	const fixtureOnlyCtx = {
		filePaths: ['test/fixtures/.env', 'docs/.env'],
		dependencies: { lodash: '^4.17.21' },
		scripts: { test: 'node --test' },
	}
	assert.equal(envExampleRule.check(fixtureOnlyCtx).status, 'info')
	assert.equal(envExampleRule.check(fixtureOnlyCtx).message, '.env.example not needed; no environment usage detected.')
	assert.equal(envDocRule.check(fixtureOnlyCtx).status, 'pass')

	// Case 9: In runDiagnostics, no-env project gets info for .env.example without warning
	const diagRes = runDiagnostics({
		packageJson: { name: 'simple-node-app', scripts: { start: 'node index.js', test: 'node --test' }, engines: { node: '>=20.0.0' } },
		treeData: { tree: [{ path: 'package.json', type: 'blob' }, { path: 'README.md', type: 'blob' }, { path: '.gitignore', type: 'blob' }, { path: 'package-lock.json', type: 'blob' }, { path: 'LICENSE', type: 'blob' }, { path: '.github/workflows/ci.yml', type: 'blob' }] },
	})
	const envExDiag = diagRes.diagnostics.find((d) => d.ruleId === 'environment-example')
	assert.ok(envExDiag)
	assert.equal(envExDiag.status, 'info')
	assert.equal(envExDiag.level, 'info')
	assert.equal(envExDiag.message, '.env.example not needed; no environment usage detected.')
})


