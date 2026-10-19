const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { app } = require('./server')
const { handleHealth } = require('./routes/health')
const errorHandler = require('./middleware/errorHandler')
const packageJson = require('../package.json')
const {
	getGithubHeaders,
	ghFetch,
	redactToken,
	formatResetTime,
	mapGitHubError,
	updateRateLimitFromHeaders,
	getCachedRateLimit,
	setCachedRateLimit,
	clearRateLimitCache,
	RATE_LIMIT_CACHE_TTL_MS,
	cache: ghCache,
} = require('./services/github')
const { fetchRepoArchive } = require('./services/archive')

let server
let baseUrl
const initialEnvToken = process.env.GITHUB_TOKEN

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
	if (initialEnvToken !== undefined) {
		process.env.GITHUB_TOKEN = initialEnvToken
	} else {
		delete process.env.GITHUB_TOKEN
	}
	clearRateLimitCache()
	if (server) {
		await new Promise((resolve) => server.close(resolve))
	}
})

// 1. Health Shape & Direct Execution (No server needed)
test('health shape: direct handler returns expected shape without server', () => {
	let capturedStatus = 200
	let capturedJson = null

	const req = {}
	const res = {
		status(code) {
			capturedStatus = code
			return this
		},
		json(data) {
			capturedJson = data
			return this
		},
	}

	handleHealth(req, res)

	assert.equal(capturedStatus, 200)
	assert.ok(capturedJson, 'Response JSON should be present')
	assert.equal(capturedJson.status, 'ok')
	assert.equal(capturedJson.message, 'SetupDoctor backend is running')
	assert.equal(typeof capturedJson.uptimeSeconds, 'number')
	assert.ok(capturedJson.uptimeSeconds >= 0)
	assert.equal(capturedJson.version, packageJson.version)
	assert.equal(typeof capturedJson.githubTokenConfigured, 'boolean')
	assert.ok(capturedJson.githubRateLimit === null || typeof capturedJson.githubRateLimit === 'object')
	assert.equal(typeof capturedJson.graphCache, 'object')
	assert.equal(typeof capturedJson.graphCache.entries, 'number')
	assert.equal(typeof capturedJson.graphCache.max, 'number')
	assert.equal(typeof capturedJson.activeDeepScans, 'number')

	// Ensure no forbidden fields or file paths or env values leaked
	const serialized = JSON.stringify(capturedJson)
	assert.ok(!serialized.includes('\\'), 'No backslash file paths')
	assert.ok(!serialized.includes('/Users/'), 'No user paths')
	assert.ok(!serialized.includes('node_modules'), 'No node_modules path')
})

test('health shape: HTTP GET /api/health responds in under 200 ms and never calls GitHub synchronously', async () => {
	let gitHubFetchCalled = false
	const originalFetch = globalThis.fetch
	globalThis.fetch = async (url, options) => {
		if (typeof url === 'string' && url.includes('github.com')) {
			gitHubFetchCalled = true
			throw new Error('GitHub was called synchronously!')
		}
		return originalFetch(url, options)
	}

	try {
		const start = Date.now()
		const res = await originalFetch(`${baseUrl}/api/health`)
		const duration = Date.now() - start

		assert.equal(res.status, 200)
		assert.ok(duration < 200, `Health endpoint took ${duration}ms, expected under 200ms`)
		assert.equal(gitHubFetchCalled, false, 'Health check must never call GitHub synchronously')

		const data = await res.json()
		assert.equal(data.status, 'ok')
		assert.equal(data.message, 'SetupDoctor backend is running')
		assert.equal(data.version, packageJson.version)
		assert.equal(typeof data.uptimeSeconds, 'number')
		assert.equal(typeof data.githubTokenConfigured, 'boolean')
		assert.equal(typeof data.graphCache.entries, 'number')
		assert.equal(data.graphCache.max, 3)
		assert.equal(typeof data.activeDeepScans, 'number')
	} finally {
		globalThis.fetch = originalFetch
	}
})

// 2. Health works with and without token
test('health works without a token', () => {
	delete process.env.GITHUB_TOKEN
	let capturedJson = null
	handleHealth({}, { json: (data) => { capturedJson = data } })

	assert.equal(capturedJson.status, 'ok')
	assert.equal(capturedJson.githubTokenConfigured, false)

	const headers = getGithubHeaders()
	assert.equal(headers.Authorization, undefined)
})

test('health works with a token', () => {
	const FAKE_TEST_TOKEN = 'ghp_fake_test_token_sample_abc123'
	process.env.GITHUB_TOKEN = FAKE_TEST_TOKEN
	let capturedJson = null
	handleHealth({}, { json: (data) => { capturedJson = data } })

	assert.equal(capturedJson.status, 'ok')
	assert.equal(capturedJson.githubTokenConfigured, true)
	assert.equal(JSON.stringify(capturedJson).includes(FAKE_TEST_TOKEN), false)

	const headers = getGithubHeaders()
	assert.equal(headers.Authorization, `Bearer ${FAKE_TEST_TOKEN}`)
})

test('health works with empty or whitespace token', () => {
	process.env.GITHUB_TOKEN = '   '
	let capturedJson = null
	handleHealth({}, { json: (data) => { capturedJson = data } })

	assert.equal(capturedJson.status, 'ok')
	assert.equal(capturedJson.githubTokenConfigured, false)

	const headers = getGithubHeaders()
	assert.equal(headers.Authorization, undefined)
})

// 3. Token never appears in logs, responses, error messages, URLs or cache keys
test('token never appears in logs, responses or error messages', async () => {
	const FAKE_SECRET_TOKEN = 'ghp_SUPER_SECRET_TOKEN_NEVER_LEAK_99887766'
	process.env.GITHUB_TOKEN = FAKE_SECRET_TOKEN

	const capturedLogs = []
	const originalLog = console.log
	const originalWarn = console.warn
	const originalError = console.error

	console.log = (...args) => capturedLogs.push(args.join(' '))
	console.warn = (...args) => capturedLogs.push(args.join(' '))
	console.error = (...args) => capturedLogs.push(args.join(' '))

	try {
		// 1. Direct handler
		let directJson = null
		handleHealth({}, { json: (data) => { directJson = data } })
		assert.equal(JSON.stringify(directJson).includes(FAKE_SECRET_TOKEN), false)

		// 2. HTTP response
		const res = await fetch(`${baseUrl}/api/health`)
		const responseText = await res.text()
		assert.equal(responseText.includes(FAKE_SECRET_TOKEN), false)

		// 3. Error handler redacts token in error message
		let errCapturedJson = null
		const testError = new Error(`Connection failed with token: ${FAKE_SECRET_TOKEN} on https://api.github.com`)
		testError.status = 500
		errorHandler(testError, {}, {
			status: () => ({
				json: (d) => { errCapturedJson = d },
			}),
		}, () => {})

		assert.equal(JSON.stringify(errCapturedJson).includes(FAKE_SECRET_TOKEN), false)
		assert.ok(errCapturedJson.message.includes('[REDACTED]'))

		// 4. ghFetch redacts token in thrown errors
		const mockFailingFetch = async () => {
			throw new Error(`Unauthorized with token ${FAKE_SECRET_TOKEN}`)
		}

		await assert.rejects(
			async () => {
				await ghFetch('https://api.github.com/repos/test/leak-check', {
					fetchFn: mockFailingFetch,
				})
			},
			(err) => {
				assert.equal(err.message.includes(FAKE_SECRET_TOKEN), false)
				assert.ok(err.message.includes('[REDACTED]'))
				return true
			},
		)

		// 5. Ensure console logs during these operations contain no secret token
		for (const logLine of capturedLogs) {
			assert.equal(logLine.includes(FAKE_SECRET_TOKEN), false, `Log line contained token: ${logLine}`)
		}

		// 6. Check cache keys
		for (const key of ghCache.keys()) {
			assert.equal(key.includes(FAKE_SECRET_TOKEN), false, `Cache key contained token: ${key}`)
		}
	} finally {
		console.log = originalLog
		console.warn = originalWarn
		console.error = originalError
		delete process.env.GITHUB_TOKEN
	}
})

// 4. Rate-limit cache
test('rate-limit cache: cached for 60s, null if unavailable, updates from headers', () => {
	clearRateLimitCache()
	assert.equal(getCachedRateLimit(), null)

	let capturedJson = null
	handleHealth({}, { json: (data) => { capturedJson = data } })
	assert.equal(capturedJson.githubRateLimit, null)

	// Update from headers with numeric reset
	updateRateLimitFromHeaders({
		'x-ratelimit-remaining': '4990',
		'x-ratelimit-limit': '5000',
		'x-ratelimit-reset': '1770000000',
	})

	const cached = getCachedRateLimit()
	assert.ok(cached)
	assert.equal(cached.remaining, 4990)
	assert.equal(cached.limit, 5000)
	assert.equal(cached.resetsAt, new Date(1770000000 * 1000).toISOString())

	// Health handler reflects cached rate limit
	handleHealth({}, { json: (data) => { capturedJson = data } })
	assert.deepEqual(capturedJson.githubRateLimit, {
		remaining: 4990,
		limit: 5000,
		resetsAt: new Date(1770000000 * 1000).toISOString(),
	})

	// Expired cache (> 60 s) returns null
	setCachedRateLimit(
		{ remaining: 4990, limit: 5000, resetsAt: '2026-10-20T03:00:00.000Z' },
		Date.now() - (RATE_LIMIT_CACHE_TTL_MS + 1000),
	)
	assert.equal(getCachedRateLimit(), null)

	handleHealth({}, { json: (data) => { capturedJson = data } })
	assert.equal(capturedJson.githubRateLimit, null)

	clearRateLimitCache()
})

// 5. Error mappings in plain words
test('error mapping: 401 -> "GitHub token is invalid or expired"', async () => {
	const err = mapGitHubError(401)
	assert.equal(err.status, 401)
	assert.equal(err.message, 'GitHub token is invalid or expired')

	// Via ghFetch
	const mockFetch401 = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
	await assert.rejects(
		async () => {
			await ghFetch('https://api.github.com/repos/test/401-check', { fetchFn: mockFetch401 })
		},
		(thrown) => {
			assert.equal(thrown.status, 401)
			assert.equal(thrown.message, 'GitHub token is invalid or expired')
			return true
		},
	)

	// Via fetchRepoArchive
	await assert.rejects(
		async () => {
			await fetchRepoArchive('test', 'repo', 'main', { fetchFn: mockFetch401 })
		},
		(thrown) => {
			assert.equal(thrown.status, 401)
			assert.equal(thrown.message, 'GitHub token is invalid or expired')
			return true
		},
	)
})

test('error mapping: 403/429 rate limit -> "GitHub rate limit reached, resets at <time>"', async () => {
	const fixedResetTime = '2026-10-20T04:00:00.000Z'

	// 403 with x-ratelimit-remaining: '0'
	const err403 = mapGitHubError(403, {
		'x-ratelimit-remaining': '0',
		'x-ratelimit-reset': fixedResetTime,
	})
	assert.equal(err403.status, 429)
	assert.equal(err403.message, `GitHub rate limit reached, resets at ${fixedResetTime}`)

	// 429 with x-ratelimit-reset header
	const err429 = mapGitHubError(429, {
		'x-ratelimit-reset': fixedResetTime,
	})
	assert.equal(err429.status, 429)
	assert.equal(err429.message, `GitHub rate limit reached, resets at ${fixedResetTime}`)

	// Via ghFetch with 403 rate limit
	const mockFetch403 = async () => new Response(JSON.stringify({ message: 'rate limit' }), {
		status: 403,
		headers: {
			'x-ratelimit-remaining': '0',
			'x-ratelimit-reset': fixedResetTime,
		},
	})

	await assert.rejects(
		async () => {
			await ghFetch('https://api.github.com/repos/test/403-rate-check', { fetchFn: mockFetch403 })
		},
		(thrown) => {
			assert.equal(thrown.status, 429)
			assert.equal(thrown.message, `GitHub rate limit reached, resets at ${fixedResetTime}`)
			return true
		},
	)

	// Via fetchRepoArchive with 429 rate limit
	const mockFetch429 = async () => new Response(JSON.stringify({ message: 'too many' }), {
		status: 429,
		headers: {
			'x-ratelimit-reset': fixedResetTime,
		},
	})

	await assert.rejects(
		async () => {
			await fetchRepoArchive('test', 'repo', 'main', { fetchFn: mockFetch429 })
		},
		(thrown) => {
			assert.equal(thrown.status, 429)
			assert.equal(thrown.message, `GitHub rate limit reached, resets at ${fixedResetTime}`)
			return true
		},
	)
})

test('error mapping: 404 -> "Repository not found or private"', async () => {
	const err = mapGitHubError(404)
	assert.equal(err.status, 404)
	assert.equal(err.message, 'Repository not found or private')

	// Via archive download
	const mockFetch404 = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
	await assert.rejects(
		async () => {
			await fetchRepoArchive('test', 'not-found-repo', 'main', { fetchFn: mockFetch404 })
		},
		(thrown) => {
			assert.equal(thrown.status, 404)
			assert.equal(thrown.message, 'Repository not found or private')
			return true
		},
	)

	// Via analyze endpoint
	const originalFetch = globalThis.fetch
	globalThis.fetch = mockFetch404
	try {
		const res = await originalFetch(`${baseUrl}/api/analyze`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ repositoryUrl: 'https://github.com/fake-user/private-repo' }),
		})
		assert.equal(res.status, 404)
		const data = await res.json()
		assert.equal(data.message, 'Repository not found or private')
	} finally {
		globalThis.fetch = originalFetch
	}
})
