const assert = require('node:assert/strict')
const test = require('node:test')
const {
	computeChangeImpact,
	generateMarkdownSummary,
	getCachedChangeImpact,
	setCachedChangeImpact,
	clearChangeImpactCache,
} = require('./services/changeImpact')
const { handleChangeImpact } = require('./routes/repository')

// Mock base graph for testing
function createMockGraph() {
	return {
		nodes: [
			{ id: 0, path: 'src/index.js', isEntry: true, isTest: false },
			{ id: 1, path: 'src/services/calc.js', isEntry: false, isTest: false },
			{ id: 2, path: 'src/utils/math.js', isEntry: false, isTest: false },
			{ id: 3, path: 'src/lib/oldHelper.js', isEntry: false, isTest: false },
			{ id: 4, path: 'src/pages/Dashboard.jsx', isEntry: false, isTest: false },
			{ id: 5, path: 'src/tests/calc.test.js', isEntry: false, isTest: true },
			{ id: 6, path: 'src/services/api.js', isEntry: false, isTest: false },
			{ id: 7, path: 'src/main.js', isEntry: true, isTest: false },
		],
		edges: [
			[0, 1], // index imports calc
			[1, 2], // calc imports math
			[5, 1], // calc.test imports calc
			[4, 3], // Dashboard imports oldHelper
			[7, 6], // main imports api
		],
		summary: {
			entryPoints: ['src/index.js', 'src/main.js'],
			profile: {
				routes: [
					{ method: 'GET', path: '/api/calc', file: 'src/services/calc.js' },
				],
			},
		},
	}
}

const mockBaseFiles = {
	'src/pages/Dashboard.jsx': `import React from 'react';
import { oldHelper } from '../lib/oldHelper';
export default function Dashboard() { return oldHelper(); }`,
	'src/main.js': `import { getApi } from './services/api';
getApi();`,
	'src/services/calc.js': `import { add } from '../utils/math';
export function calculate(a, b) { return add(a, b); }`,
}

test('computeChangeImpact: modified fixture computes direct, indirect, unchanged-but-affected, tests reached', () => {
	const baseGraph = createMockGraph()
	const changedFiles = [
		{ filename: 'src/utils/math.js', status: 'modified' },
	]

	const result = computeChangeImpact({
		changedFiles,
		baseGraph,
		baseFiles: mockBaseFiles,
		owner: 'testowner',
		repo: 'testrepo',
		pullNumber: 1,
		baseRef: 'main',
		headSha: 'abc1234',
	})

	// 1. Mapped files
	assert.equal(result.changedFiles.mappedCount, 1)
	assert.equal(result.changedFiles.mapped[0].path, 'src/utils/math.js')
	assert.equal(result.changedFiles.newOrUnmappedCount, 0)

	// 2. Blast radius
	// math -> direct dependent: calc.js; indirect: index.js, calc.test.js
	assert.ok(result.blastRadius.direct.includes('src/services/calc.js'))
	assert.ok(result.blastRadius.indirect.includes('src/index.js'))
	assert.ok(result.blastRadius.indirect.includes('src/tests/calc.test.js'))
	assert.equal(result.blastRadius.affectedCount, 3)

	// 3. Unchanged but affected
	assert.equal(result.unchangedButAffected.count, 3)
	assert.ok(result.unchangedButAffected.files.includes('src/services/calc.js'))
	assert.ok(result.unchangedButAffected.files.includes('src/index.js'))
	assert.ok(result.unchangedButAffected.files.includes('src/tests/calc.test.js'))

	// 4. Tests reached
	assert.equal(result.tests.count, 1)
	assert.ok(result.tests.files.includes('src/tests/calc.test.js'))

	// 5. Entry points and routes reached
	assert.ok(result.entryPointsReached.includes('src/index.js'))
	assert.ok(result.routesReached.some((r) => r.path === '/api/calc'))

	// 6. Risk level: critical entry points and routes reached -> High risk
	assert.equal(result.risk.level, 'High')
	assert.ok(result.risk.reason.includes('Reaches critical entry points'))
})

test('computeChangeImpact: added file fixture reports as new or unmapped with Low risk', () => {
	const baseGraph = createMockGraph()
	const changedFiles = [
		{ filename: 'src/features/newFeature.js', status: 'added' },
		{ filename: 'README.md', status: 'modified' },
	]

	const result = computeChangeImpact({
		changedFiles,
		baseGraph,
		baseFiles: mockBaseFiles,
		owner: 'testowner',
		repo: 'testrepo',
		pullNumber: 2,
	})

	assert.equal(result.changedFiles.mappedCount, 0)
	assert.equal(result.changedFiles.newOrUnmappedCount, 2)
	assert.equal(result.blastRadius.affectedCount, 0)
	assert.equal(result.unchangedButAffected.count, 0)
	assert.equal(result.willBreak.count, 0)
	assert.equal(result.risk.level, 'Low')
})

test('computeChangeImpact: removed file fixture detects "will break" finding with importer and line', () => {
	const baseGraph = createMockGraph()
	const changedFiles = [
		{ filename: 'src/lib/oldHelper.js', status: 'removed' },
	]

	const result = computeChangeImpact({
		changedFiles,
		baseGraph,
		baseFiles: mockBaseFiles,
		owner: 'testowner',
		repo: 'testrepo',
		pullNumber: 3,
	})

	// Dashboard imports oldHelper and is NOT in changedFiles -> will break!
	assert.equal(result.willBreak.count, 1)
	const finding = result.willBreak.findings[0]
	assert.equal(finding.file, 'src/lib/oldHelper.js')
	assert.equal(finding.status, 'removed')
	assert.equal(finding.importer, 'src/pages/Dashboard.jsx')
	assert.equal(finding.line, 2)
	assert.ok(finding.snippet.includes("import { oldHelper } from '../lib/oldHelper'"))
	assert.equal(result.risk.level, 'High')
	assert.ok(result.risk.reason.includes('will-break finding'))
})

test('computeChangeImpact: renamed file fixture detects "will break" if importer is unchanged', () => {
	const baseGraph = createMockGraph()
	const changedFiles = [
		{
			filename: 'src/services/apiClient.js',
			previous_filename: 'src/services/api.js',
			status: 'renamed',
		},
	]

	const result = computeChangeImpact({
		changedFiles,
		baseGraph,
		baseFiles: mockBaseFiles,
		owner: 'testowner',
		repo: 'testrepo',
		pullNumber: 4,
	})

	assert.equal(result.willBreak.count, 1)
	const finding = result.willBreak.findings[0]
	assert.equal(finding.file, 'src/services/api.js')
	assert.equal(finding.status, 'renamed')
	assert.equal(finding.newName, 'src/services/apiClient.js')
	assert.equal(finding.importer, 'src/main.js')
	assert.equal(finding.line, 1)
	assert.ok(finding.snippet.includes("import { getApi } from './services/api'"))
	assert.equal(result.risk.level, 'High')
})

test('computeChangeImpact: no "will break" when importer is ALSO changed in the PR', () => {
	const baseGraph = createMockGraph()
	const changedFiles = [
		{ filename: 'src/lib/oldHelper.js', status: 'removed' },
		{ filename: 'src/pages/Dashboard.jsx', status: 'modified' }, // Importer is also changed!
	]

	const result = computeChangeImpact({
		changedFiles,
		baseGraph,
		baseFiles: mockBaseFiles,
		owner: 'testowner',
		repo: 'testrepo',
		pullNumber: 5,
	})

	// Because Dashboard is in the PR, it's addressed
	assert.equal(result.willBreak.count, 0)
})

test('computeChangeImpact: truncation caps changed files at 300 and sets truncated: true', () => {
	const baseGraph = createMockGraph()
	const bigChangedFiles = Array.from({ length: 350 }, (_, i) => ({
		filename: `src/generated/file_${i}.js`,
		status: 'modified',
	}))

	const result = computeChangeImpact({
		changedFiles: bigChangedFiles.slice(0, 300),
		baseGraph,
		truncated: true,
	})

	assert.equal(result.changedFiles.total, 300)
	assert.equal(result.changedFiles.truncated, true)
	assert.ok(result.markdownSummary.includes('capped at 300'))
})

test('generateMarkdownSummary: strictly max 60 lines and never contains tokens/secrets', () => {
	process.env.GITHUB_TOKEN = 'ghp_superSecretToken123456789'

	const summary = generateMarkdownSummary({
		owner: 'owner',
		repo: 'repo',
		pullNumber: 10,
		riskLevel: 'High',
		riskReason: 'token test ghp_superSecretToken123456789 in reason',
		changedFilesCount: 50,
		mappedFilesCount: 40,
		newOrUnmappedCount: 10,
		affectedCount: 30,
		totalCodeFiles: 100,
		percentOfRepo: 30,
		unchangedCount: 20,
		willBreakFindings: Array.from({ length: 20 }, (_, i) => ({
			file: `src/old_${i}.js`,
			status: 'removed',
			importer: `src/imp_${i}.js`,
			line: i + 1,
		})),
		folderRows: Array.from({ length: 20 }, (_, i) => ({
			folder: `src/folder_${i}`,
			affected: 5,
			total: 10,
			direct: 2,
			indirect: 3,
		})),
		testsReached: Array.from({ length: 20 }, (_, i) => `src/tests/test_${i}.test.js`),
	})

	// Must never leak token
	assert.ok(!summary.includes('ghp_superSecretToken123456789'), 'Summary must never include GITHUB_TOKEN')
	assert.ok(summary.includes('[REDACTED]'), 'Token must be redacted')

	// Must not exceed 60 lines
	const lineCount = summary.split('\n').length
	assert.ok(lineCount <= 60, `Summary line count ${lineCount} exceeds 60 lines`)

	// Uses +N more
	assert.ok(summary.includes('more broken imports') || summary.includes('more folders') || summary.includes('more tests'))

	delete process.env.GITHUB_TOKEN
})

test('POST /api/repository/change-impact: handles PR URL, 10-minute caching, and 404', async () => {
	clearChangeImpactCache()
	const baseGraph = createMockGraph()

	// Mock fetch function
	let prFetchCount = 0
	const mockFetchFn = async (url) => {
		if (url.includes('/pulls/999')) {
			return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
		}
		if (url.includes('/pulls/15/files')) {
			return new Response(JSON.stringify([
				{ filename: 'src/utils/math.js', status: 'modified' },
			]), { status: 200, headers: { 'Content-Type': 'application/json' } })
		}
		if (url.includes('/pulls/15')) {
			prFetchCount++
			return new Response(JSON.stringify({
				number: 15,
				title: 'Update math calculations',
				head: { sha: 'commit1234' },
				base: { ref: 'main', sha: 'base1234' },
			}), { status: 200, headers: { 'Content-Type': 'application/json' } })
		}
		if (url.includes('/tarball/main')) {
			// Not called if cached graph used
			return new Response('fake-tarball', { status: 200 })
		}
		return new Response('Not Found', { status: 404 })
	}

	// 1. Missing params returns 400
	let req = { body: {} }
	let resData = null
	let resStatus = 200
	let res = {
		status: (code) => { resStatus = code; return res },
		json: (data) => { resData = data; return res },
	}
	let nextErr = null
	await handleChangeImpact(req, res, (err) => { nextErr = err })
	assert.ok(nextErr)
	assert.equal(nextErr.status, 400)

	// 2. PR not found returns 404
	req = {
		body: {
			repositoryUrl: 'https://github.com/testowner/testrepo/pull/999',
			fetchFn: mockFetchFn,
		},
	}
	nextErr = null
	await handleChangeImpact(req, res, (err) => { nextErr = err })
	assert.ok(nextErr)
	assert.equal(nextErr.status, 404)
	assert.ok(nextErr.message.includes('Pull request #999 not found'))

	// Pre-seed cached graph for main branch
	const { setCachedGraph } = require('./services/graph')
	setCachedGraph('testowner', 'testrepo', 'main', {
		graph: { nodes: baseGraph.nodes, edges: baseGraph.edges },
		summary: baseGraph.summary,
	})

	// 3. Successful PR request via full PR URL
	req = {
		body: {
			repositoryUrl: 'https://github.com/testowner/testrepo/pull/15',
			fetchFn: mockFetchFn,
		},
	}
	nextErr = null
	resData = null
	await handleChangeImpact(req, res, (err) => { nextErr = err })
	assert.equal(nextErr, null)
	assert.ok(resData.success)
	assert.equal(resData.pullNumber, 15)
	assert.equal(resData.cached, false)
	assert.equal(resData.changedFiles.total, 1)
	assert.equal(resData.blastRadius.affectedCount, 3)
	assert.equal(prFetchCount, 1)

	// 4. Repeated request returns cached: true without refetching from GitHub
	resData = null
	await handleChangeImpact(req, res, (err) => { nextErr = err })
	assert.equal(nextErr, null)
	assert.ok(resData.success)
	assert.equal(resData.cached, true)
	assert.equal(prFetchCount, 1) // Did not hit network again!
})
