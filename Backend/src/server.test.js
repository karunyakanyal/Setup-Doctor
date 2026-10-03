const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { app } = require('./server')
const {
	checkNodeEngine,
	checkDuplicateDependencies,
	checkEnvironmentFileSafety,
	calculateHealthScore,
} = require('./rules')

let server
let baseUrl

before(async () => {
	await new Promise((resolve) => {
		server = app.listen(0, () => {
			const { port } = server.address()
			baseUrl = `http://127.0.0.1:${port}`
			resolve()
		})
	})
})

after(async () => {
	if (server) {
		await new Promise((resolve) => server.close(resolve))
	}
})

test('GET /api/health returns 200', async () => {
	const res = await fetch(`${baseUrl}/api/health`)
	assert.equal(res.status, 200)
	const data = await res.json()
	assert.equal(data.status, 'ok')
	assert.equal(data.message, 'SetupDoctor backend is running')
})

test('invalid owner or repo returns 400', async () => {
	// GET /api/repository/tree with invalid owner
	const treeRes1 = await fetch(`${baseUrl}/api/repository/tree?owner=invalid*owner&repo=valid-repo&branch=main`)
	assert.equal(treeRes1.status, 400)
	const treeData1 = await treeRes1.json()
	assert.equal(treeData1.success, false)

	// GET /api/repository/tree with invalid repo
	const treeRes2 = await fetch(`${baseUrl}/api/repository/tree?owner=valid-owner&repo=invalid%20repo&branch=main`)
	assert.equal(treeRes2.status, 400)
	const treeData2 = await treeRes2.json()
	assert.equal(treeData2.success, false)

	// POST /api/repository/build-check with invalid owner
	const buildRes = await fetch(`${baseUrl}/api/repository/build-check`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ owner: 'invalid$user', repo: 'my-repo', branch: 'main' }),
	})
	assert.equal(buildRes.status, 400)
	const buildData = await buildRes.json()
	assert.equal(buildData.success, false)

	// POST /api/analyze with invalid owner in repositoryUrl
	const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ repositoryUrl: 'https://github.com/bad*owner/repo' }),
	})
	assert.equal(analyzeRes.status, 400)
	const analyzeData = await analyzeRes.json()
	assert.equal(analyzeData.success, false)
})

test("/api/repository/file with path '../x' or 'secrets.pem' returns 403", async () => {
	// Path with traversal ('../x')
	const resDotDot = await fetch(`${baseUrl}/api/repository/file?owner=owner&repo=repo&branch=main&path=../x`)
	assert.equal(resDotDot.status, 403)
	const dataDotDot = await resDotDot.json()
	assert.equal(dataDotDot.success, false)
	assert.equal(dataDotDot.message, 'Access to the requested file is forbidden')

	// Non-allowlisted file ('secrets.pem')
	const resSecret = await fetch(`${baseUrl}/api/repository/file?owner=owner&repo=repo&branch=main&path=secrets.pem`)
	assert.equal(resSecret.status, 403)
	const dataSecret = await resSecret.json()
	assert.equal(dataSecret.success, false)
	assert.equal(dataSecret.message, 'Access to the requested file is forbidden')
})

test("health score ignores 'info' diagnostics", () => {
	const passingDiagnostic = { rule: 'package-json', status: 'pass' }
	const infoDiagnostic = {
		rule: 'tree-truncation',
		status: 'info',
		level: 'info',
		message: 'Repository tree truncated; results may be incomplete.',
	}

	const baseHealth = calculateHealthScore([passingDiagnostic])
	assert.equal(baseHealth.score, 100)
	assert.equal(baseHealth.status, 'Healthy')

	// Adding info diagnostic must not dilute the score or count as a non-pass item
	const healthWithInfo = calculateHealthScore([passingDiagnostic, infoDiagnostic])
	assert.equal(healthWithInfo.score, 100)
	assert.equal(healthWithInfo.status, 'Healthy')

	// Check with warning diagnostic + info diagnostic
	const warningDiagnostic = { rule: 'scripts', status: 'warning' }
	const baseWarningHealth = calculateHealthScore([warningDiagnostic])
	const warningWithInfoHealth = calculateHealthScore([warningDiagnostic, infoDiagnostic])
	assert.equal(baseWarningHealth.score, 50)
	assert.equal(warningWithInfoHealth.score, 50)
})

test('rules: node-engine rule evaluates passing and failing inputs', () => {
	// Passing: engines specified with node
	const passResult = checkNodeEngine({ node: '>=20.0.0' })
	assert.equal(passResult.rule, 'node-engine')
	assert.equal(passResult.status, 'pass')

	const passPackageJsonResult = checkNodeEngine({ engines: { node: '>=18.0.0' } })
	assert.equal(passPackageJsonResult.status, 'pass')

	// Failing: engines missing or without node
	const failResult = checkNodeEngine({})
	assert.equal(failResult.rule, 'node-engine')
	assert.equal(failResult.status, 'warning')

	const failEmptyPackageJsonResult = checkNodeEngine({ engines: {} })
	assert.equal(failEmptyPackageJsonResult.status, 'warning')
})

test('rules: duplicate-dependencies rule evaluates passing and failing inputs', () => {
	// Passing: no overlap
	const passResult = checkDuplicateDependencies(
		{ react: '^19.0.0', express: '^5.0.0' },
		{ nodemon: '^3.0.0', vitest: '^1.0.0' },
	)
	assert.equal(passResult.rule, 'duplicate-dependencies')
	assert.equal(passResult.status, 'pass')

	// Failing: duplicated dependency in both dependencies and devDependencies
	const failResult = checkDuplicateDependencies(
		{ react: '^19.0.0', typescript: '^5.0.0' },
		{ typescript: '^5.0.0', eslint: '^9.0.0' },
	)
	assert.equal(failResult.rule, 'duplicate-dependencies')
	assert.equal(failResult.status, 'warning')
	assert.match(failResult.message, /typescript/)
})

test('rules: environment-file-safety rule evaluates passing and failing inputs', () => {
	// Passing: no .env file committed
	const passResult = checkEnvironmentFileSafety(['package.json', 'README.md', '.env.example', 'src/server.js'])
	assert.equal(passResult.rule, 'environment-file-safety')
	assert.equal(passResult.status, 'pass')

	// Failing: committed .env file detected
	const failResult = checkEnvironmentFileSafety(['package.json', '.env', 'README.md'])
	assert.equal(failResult.rule, 'environment-file-safety')
	assert.equal(failResult.status, 'warning')
	assert.match(failResult.message, /committed/)
})
