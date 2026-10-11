const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { handleGraph, graphLimiter } = require('./routes/repository')
const { setArchiveCache, clearArchiveCache } = require('./services/archive')
const errorHandler = require('./middleware/errorHandler')

function createMockReqRes({ body = {}, ip = '127.0.0.1' } = {}) {
	const req = {
		body,
		ip,
		headers: {},
		connection: { remoteAddress: ip },
		socket: { remoteAddress: ip },
		app: { get: () => false },
	}

	let statusCode = 200
	let responseJson = null
	const responseHeaders = {}

	const res = {
		status(code) {
			statusCode = code
			return this
		},
		json(data) {
			responseJson = data
			return this
		},
		setHeader(key, value) {
			responseHeaders[key.toLowerCase()] = value
			return this
		},
		getHeader(key) {
			return responseHeaders[key.toLowerCase()]
		},
	}

	return {
		req,
		res,
		getStatus: () => statusCode,
		getBody: () => responseJson,
		getHeaders: () => responseHeaders,
	}
}

test('POST /api/repository/graph validation: missing fields return 400', async () => {
	// Missing all
	const mock1 = createMockReqRes({ body: {} })
	await handleGraph(mock1.req, mock1.res, () => {})
	assert.equal(mock1.getStatus(), 400)
	assert.deepEqual(mock1.getBody(), {
		success: false,
		message: 'owner, repo, and branch are required',
	})

	// Missing repo
	const mock2 = createMockReqRes({ body: { owner: 'facebook', branch: 'main' } })
	await handleGraph(mock2.req, mock2.res, () => {})
	assert.equal(mock2.getStatus(), 400)
	assert.deepEqual(mock2.getBody(), {
		success: false,
		message: 'owner, repo, and branch are required',
	})

	// Missing branch
	const mock3 = createMockReqRes({ body: { owner: 'facebook', repo: 'react' } })
	await handleGraph(mock3.req, mock3.res, () => {})
	assert.equal(mock3.getStatus(), 400)
	assert.deepEqual(mock3.getBody(), {
		success: false,
		message: 'owner, repo, and branch are required',
	})
})

test('POST /api/repository/graph validation: invalid identifiers return 400', async () => {
	const invalidCases = [
		{ owner: 'invalid$user', repo: 'react', branch: 'main' },
		{ owner: 'facebook', repo: 'react repo', branch: 'main' },
		{ owner: 'facebook', repo: 'react', branch: 'branch;drop' },
	]

	for (const testCase of invalidCases) {
		const mock = createMockReqRes({ body: testCase })
		await handleGraph(mock.req, mock.res, () => {})
		assert.equal(mock.getStatus(), 400)
		assert.deepEqual(mock.getBody(), {
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}
})

test('graphLimiter: allows 5 requests and blocks 6th with 429', async () => {
	const ip = '192.168.1.100'

	// First 5 requests should pass to next() without error
	for (let i = 0; i < 5; i++) {
		const mock = createMockReqRes({ ip })
		let passedNext = false
		let errorPassed = null

		await new Promise((resolve) => {
			graphLimiter(mock.req, mock.res, (err) => {
				if (err) errorPassed = err
				else passedNext = true
				resolve()
			})
		})

		assert.equal(passedNext, true, `Request ${i + 1} should pass`)
		assert.equal(errorPassed, null)
	}

	// 6th request should trigger rate limit error
	const mock6 = createMockReqRes({ ip })
	let errorPassed = null

	await new Promise((resolve) => {
		graphLimiter(mock6.req, mock6.res, (err) => {
			errorPassed = err
			resolve()
		})
	})

	assert.ok(errorPassed, '6th request should fail')
	assert.equal(errorPassed.status, 429)
	assert.equal(errorPassed.message, 'Too many requests, please try again later.')

	// Verify error handler formats this error into standard response shape
	const mockErrorRes = createMockReqRes({ ip })
	errorHandler(errorPassed, mockErrorRes.req, mockErrorRes.res, () => {})
	assert.equal(mockErrorRes.getStatus(), 429)
	assert.deepEqual(mockErrorRes.getBody(), {
		success: false,
		message: 'Too many requests, please try again later.',
	})
})

test('POST /api/repository/graph: returns complete graph payload with cached archive', async () => {
	clearArchiveCache()

	const owner = 'test-org'
	const repo = 'sample-repo'
	const branch = 'main'

	// Mock archive content
	const files = new Map()
	files.set('src/index.js', {
		size: 40,
		lang: 'javascript',
		text: 'const { helper } = require("./utils");\nhelper();',
	})
	files.set('src/utils.js', {
		size: 35,
		lang: 'javascript',
		text: 'exports.helper = () => console.log(1);',
	})

	const inventory = {
		byLanguage: { javascript: 2 },
		byFolder: { src: 2 },
		largest: [{ path: 'src/index.js', size: 40, lang: 'javascript' }],
		totalFiles: 2,
		analyzedFiles: 2,
		skipped: {},
	}

	setArchiveCache(owner, repo, branch, {
		files,
		inventory,
		truncated: false,
	})

	const mock = createMockReqRes({
		body: { owner, repo, branch },
	})

	let nextError = null
	await handleGraph(mock.req, mock.res, (err) => {
		nextError = err
	})

	assert.equal(nextError, null)
	assert.equal(mock.getStatus(), 200)

	const body = mock.getBody()
	assert.equal(body.success, true)
	assert.ok(body.inventory)
	assert.ok(body.graph)
	assert.equal(body.graph.nodes.length, 2)
	assert.equal(body.graph.edges.length, 1)
	assert.ok(body.summary)
	assert.equal(body.summary.parsedFiles, 2)
	assert.equal(body.coverage.analyzedFiles, 2)
	assert.equal(body.coverage.totalFiles, 2)
	assert.equal(body.coverage.approximate, true)

	clearArchiveCache()
})

test('POST /api/repository/graph: error propagation passes error to central handler', async () => {
	clearArchiveCache()

	const mock = createMockReqRes({
		body: { owner: 'nonexistent-owner', repo: 'nonexistent-repo', branch: 'nonexistent-branch' },
	})

	let nextError = null
	await handleGraph(mock.req, mock.res, (err) => {
		nextError = err
	})

	assert.ok(nextError)
	assert.ok(nextError.status >= 400)

	const mockErrRes = createMockReqRes()
	errorHandler(nextError, mockErrRes.req, mockErrRes.res, () => {})
	assert.equal(mockErrRes.getStatus(), nextError.status)
	assert.equal(mockErrRes.getBody().success, false)
	assert.ok(mockErrRes.getBody().message)
})
