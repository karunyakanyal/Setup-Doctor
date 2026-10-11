const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const zlib = require('zlib')
const tar = require('tar-stream')
const { Readable } = require('stream')
const {
	handleGraph,
	graphLimiter,
	getActiveScans,
	resetActiveScans,
	MAX_CONCURRENT_SCANS,
} = require('./routes/repository')
const { setArchiveCache, clearArchiveCache } = require('./services/archive')
const errorHandler = require('./middleware/errorHandler')

function createMockReqRes({ body = {}, ip = '127.0.0.1' } = {}) {
	const reqListeners = {}
	const resListeners = {}

	const req = {
		body,
		ip,
		headers: {},
		connection: { remoteAddress: ip },
		socket: { remoteAddress: ip },
		app: { get: () => false },
		on(event, cb) {
			reqListeners[event] = reqListeners[event] || []
			reqListeners[event].push(cb)
			return this
		},
		removeListener(event, cb) {
			if (reqListeners[event]) {
				reqListeners[event] = reqListeners[event].filter((l) => l !== cb)
			}
			return this
		},
		emit(event, ...args) {
			if (reqListeners[event]) {
				reqListeners[event].forEach((cb) => cb(...args))
			}
		},
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
			responseHeaders[key.toLowerCase()] = String(value)
			return this
		},
		set(key, value) {
			responseHeaders[key.toLowerCase()] = String(value)
			return this
		},
		getHeader(key) {
			return responseHeaders[key.toLowerCase()]
		},
		on(event, cb) {
			resListeners[event] = resListeners[event] || []
			resListeners[event].push(cb)
			return this
		},
		removeListener(event, cb) {
			if (resListeners[event]) {
				resListeners[event] = resListeners[event].filter((l) => l !== cb)
			}
			return this
		},
		emit(event, ...args) {
			if (resListeners[event]) {
				resListeners[event].forEach((cb) => cb(...args))
			}
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

const { setCachedGraph, getCachedGraph, clearGraphCache } = require('./services/graph')

test('POST /api/repository/graph: returns complete graph payload with cached graph', async () => {
	clearGraphCache()

	const owner = 'test-org'
	const repo = 'sample-repo'
	const branch = 'main'

	const payload = {
		inventory: {
			byLanguage: { javascript: 2 },
			byFolder: { src: 2 },
			largest: [{ path: 'src/index.js', size: 40, lang: 'javascript' }],
			totalFiles: 2,
			analyzedFiles: 2,
			skipped: {},
		},
		graph: {
			nodes: [
				{ id: 0, path: 'src/index.js', lang: 'javascript', size: 40, loc: 2, fanIn: 0, fanOut: 1, isEntry: true, isOrphan: false },
				{ id: 1, path: 'src/utils.js', lang: 'javascript', size: 35, loc: 1, fanIn: 1, fanOut: 0, isEntry: false, isOrphan: false },
			],
			edges: [[0, 1]],
			externals: [],
		},
		summary: {
			entryPoints: ['src/index.js'],
			cycles: [],
			orphans: [],
			hotspots: { byFanIn: [], byTransitiveImpact: [] },
			declaredButUnused: [],
			usedButUndeclared: [],
			longestChain: 2,
			unresolvedCount: 0,
			parsedFiles: 2,
		},
		coverage: {
			analyzedFiles: 2,
			totalFiles: 2,
			skipped: {},
			truncated: false,
			graphNodesOmitted: 0,
			approximate: true,
		},
	}

	setCachedGraph(owner, repo, branch, payload)

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

	// Summary contains only the other parts, without approximate
	assert.ok(body.summary)
	assert.equal(body.summary.parsedFiles, 2)
	assert.equal(body.summary.approximate, undefined)

	// Coverage contains all required fields: analyzedFiles, totalFiles, skipped, truncated, graphNodesOmitted, approximate
	assert.ok(body.coverage)
	assert.equal(body.coverage.analyzedFiles, 2)
	assert.equal(body.coverage.totalFiles, 2)
	assert.deepEqual(body.coverage.skipped, {})
	assert.equal(body.coverage.truncated, false)
	assert.equal(body.coverage.graphNodesOmitted, 0)
	assert.equal(body.coverage.approximate, true)

	// No raw file text retained
	assert.equal(body.files, undefined)

	clearGraphCache()
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

test('POST /api/repository/graph concurrency: at most 2 concurrent scans, 3rd gets 503 and Retry-After header', async () => {
	clearGraphCache()
	resetActiveScans()

	const originalFetch = globalThis.fetch
	let releaseFetch1
	let releaseFetch2
	const fetchGate1 = new Promise((resolve) => { releaseFetch1 = resolve })
	const fetchGate2 = new Promise((resolve) => { releaseFetch2 = resolve })

	const sampleBuffer = await new Promise((resolve, reject) => {
		const pack = tar.pack()
		pack.entry({ name: 'root/src/index.js' }, 'console.log("hello");')
		pack.finalize()
		const gzip = zlib.createGzip()
		const chunks = []
		pack.pipe(gzip)
			.on('data', (c) => chunks.push(c))
			.on('end', () => resolve(Buffer.concat(chunks)))
			.on('error', reject)
	})

	let fetchCount = 0
	globalThis.fetch = async (url) => {
		fetchCount++
		if (fetchCount === 1) {
			await fetchGate1
		} else if (fetchCount === 2) {
			await fetchGate2
		}
		return {
			ok: true,
			status: 200,
			headers: {
				get: (h) => (h.toLowerCase() === 'content-length' ? String(sampleBuffer.length) : null),
			},
			body: sampleBuffer,
		}
	}

	try {
		const mock1 = createMockReqRes({ body: { owner: 'org1', repo: 'repo1', branch: 'main' } })
		const mock2 = createMockReqRes({ body: { owner: 'org2', repo: 'repo2', branch: 'main' } })
		const mock3 = createMockReqRes({ body: { owner: 'org3', repo: 'repo3', branch: 'main' } })

		// Launch 1st and 2nd scans asynchronously (they pause at fetchGate)
		const p1 = handleGraph(mock1.req, mock1.res, () => {})
		const p2 = handleGraph(mock2.req, mock2.res, () => {})

		// Give event loop a tick to enter handleGraph and increment activeScans
		await new Promise((r) => setImmediate(r))

		assert.equal(getActiveScans(), 2)

		// 3rd scan arrives while 2 scans are active: should immediately receive 503 with Retry-After header
		let nextCalledFor3 = false
		await handleGraph(mock3.req, mock3.res, () => { nextCalledFor3 = true })

		assert.equal(nextCalledFor3, false)
		assert.equal(mock3.getStatus(), 503)
		assert.equal(mock3.getHeaders()['retry-after'], '60')
		assert.deepEqual(mock3.getBody(), {
			success: false,
			message: 'Deep scan is busy. Try again in a minute.',
		})
		assert.equal(getActiveScans(), 2)

		// Cached request arrives while 2 scans are active: serves immediately without taking a slot
		setCachedGraph('cached-org', 'cached-repo', 'main', {
			inventory: { totalFiles: 1, analyzedFiles: 1 },
			graph: { nodes: [], edges: [], externals: [] },
			summary: {},
			coverage: { graphNodesOmitted: 0 },
		})
		const mockCached = createMockReqRes({ body: { owner: 'cached-org', repo: 'cached-repo', branch: 'main' } })
		await handleGraph(mockCached.req, mockCached.res, () => {})
		assert.equal(mockCached.getStatus(), 200)
		assert.equal(mockCached.getBody().success, true)
		assert.equal(getActiveScans(), 2)

		// Release 1st scan
		releaseFetch1()
		await p1

		assert.equal(mock1.getStatus(), 200)
		assert.equal(mock1.getBody().coverage.graphNodesOmitted, 0)
		assert.equal(getActiveScans(), 1)

		// Now a new scan (mock4) should succeed in acquiring a slot
		let releaseFetch4
		const fetchGate4 = new Promise((resolve) => { releaseFetch4 = resolve })
		globalThis.fetch = async () => {
			await fetchGate4
			return {
				ok: true,
				status: 200,
				headers: { get: () => String(sampleBuffer.length) },
				body: sampleBuffer,
			}
		}

		const mock4 = createMockReqRes({ body: { owner: 'org4', repo: 'repo4', branch: 'main' } })
		const p4 = handleGraph(mock4.req, mock4.res, () => {})
		await new Promise((r) => setImmediate(r))
		assert.equal(getActiveScans(), 2)

		// Release remaining scans
		releaseFetch2()
		releaseFetch4()
		await Promise.all([p2, p4])

		assert.equal(mock2.getStatus(), 200)
		assert.equal(mock4.getStatus(), 200)
		assert.equal(getActiveScans(), 0)
	} finally {
		globalThis.fetch = originalFetch
		clearGraphCache()
		resetActiveScans()
	}
})

test('POST /api/repository/graph concurrency: releases slot in finally block on error', async () => {
	clearGraphCache()
	resetActiveScans()

	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => {
		const err = new Error('GitHub API exploded')
		err.status = 502
		throw err
	}

	try {
		const mock = createMockReqRes({ body: { owner: 'err-org', repo: 'err-repo', branch: 'main' } })
		let errorReceived = null
		await handleGraph(mock.req, mock.res, (err) => {
			errorReceived = err
		})

		assert.ok(errorReceived)
		assert.equal(getActiveScans(), 0, 'Slot must be released on error')
	} finally {
		globalThis.fetch = originalFetch
		resetActiveScans()
	}
})

test('POST /api/repository/graph concurrency: releases slot when request closes/aborts or times out', async () => {
	clearGraphCache()
	resetActiveScans()

	const originalFetch = globalThis.fetch
	let releaseFetch
	const gate = new Promise((resolve) => { releaseFetch = resolve })
	globalThis.fetch = async () => {
		await gate
		return { ok: true, status: 200, headers: { get: () => '0' }, body: Buffer.alloc(0) }
	}

	try {
		// Test close
		const mockAbort = createMockReqRes({ body: { owner: 'abort-org', repo: 'abort-repo', branch: 'main' } })
		const pAbort = handleGraph(mockAbort.req, mockAbort.res, () => {})
		await new Promise((r) => setImmediate(r))

		assert.equal(getActiveScans(), 1)
		mockAbort.req.emit('close')
		assert.equal(getActiveScans(), 0, 'Slot must be released immediately on client close')

		releaseFetch()
		await pAbort
		assert.equal(getActiveScans(), 0)

		// Test timeout
		let releaseTimeout
		const gateTimeout = new Promise((resolve) => { releaseTimeout = resolve })
		globalThis.fetch = async () => {
			await gateTimeout
			return { ok: true, status: 200, headers: { get: () => '0' }, body: Buffer.alloc(0) }
		}

		const mockTimeout = createMockReqRes({ body: { owner: 'timeout-org', repo: 'timeout-repo', branch: 'main' } })
		const pTimeout = handleGraph(mockTimeout.req, mockTimeout.res, () => {})
		await new Promise((r) => setImmediate(r))

		assert.equal(getActiveScans(), 1)
		mockTimeout.req.emit('timeout')
		assert.equal(getActiveScans(), 0, 'Slot must be released on request timeout')

		releaseTimeout()
		await pTimeout
		assert.equal(getActiveScans(), 0)
	} finally {
		globalThis.fetch = originalFetch
		resetActiveScans()
	}
})
