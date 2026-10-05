const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
	ghFetch,
	cache,
	clearCache,
	CACHE_TTL_MS,
	MAX_CACHE_ENTRIES,
} = require('./services/github')

beforeEach(() => {
	clearCache()
})

test('cache hit: subsequent requests return cached response without hitting network', async () => {
	let fetchCalls = 0
	const mockFetch = async (url) => {
		fetchCalls++
		return new Response(JSON.stringify({ repo: 'setup-doctor' }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				etag: '"test-etag-1"',
			},
		})
	}

	const url = 'https://api.github.com/repos/test/setup-doctor'

	// First call - should call fetch
	const res1 = await ghFetch(url, { fetchFn: mockFetch })
	assert.equal(res1.status, 200)
	const data1 = await res1.json()
	assert.deepEqual(data1, { repo: 'setup-doctor' })
	assert.equal(fetchCalls, 1)

	// Second call - should hit cache within TTL, fetch is NOT called again
	const res2 = await ghFetch(url, { fetchFn: mockFetch })
	assert.equal(res2.status, 200)
	const data2 = await res2.json()
	assert.deepEqual(data2, { repo: 'setup-doctor' })
	assert.equal(fetchCalls, 1)
})

test('cache hit on 304: revalidates with If-None-Match and refreshes TTL', async () => {
	let sentIfNoneMatch = null
	let fetchCalls = 0

	const mockFetch = async (url, options) => {
		fetchCalls++
		sentIfNoneMatch = options.headers['If-None-Match']
		return new Response(null, {
			status: 304,
			headers: {
				etag: '"etag-304"',
			},
		})
	}

	const url = 'https://api.github.com/repos/test/revalidate'

	// Populate an expired entry in cache
	cache.set(url, {
		status: 200,
		statusText: 'OK',
		headers: { etag: '"etag-304"' },
		body: JSON.stringify({ cached: true }),
		etag: '"etag-304"',
		expiresAt: Date.now() - 5000, // expired
	})

	const res = await ghFetch(url, { fetchFn: mockFetch })
	assert.equal(fetchCalls, 1)
	assert.equal(sentIfNoneMatch, '"etag-304"')
	assert.equal(res.status, 200)

	const data = await res.json()
	assert.deepEqual(data, { cached: true })

	// Verify TTL was renewed
	const updated = cache.get(url)
	assert.ok(updated.expiresAt > Date.now())
})

test('cache expiry: expired entry triggers new network fetch and updates cache', async () => {
	let fetchCalls = 0
	const mockFetch = async () => {
		fetchCalls++
		return new Response(JSON.stringify({ version: 'v2' }), {
			status: 200,
			headers: {
				etag: '"new-etag"',
			},
		})
	}

	const url = 'https://api.github.com/repos/test/expiry'

	// Pre-populate with expired entry
	cache.set(url, {
		status: 200,
		statusText: 'OK',
		headers: {},
		body: JSON.stringify({ version: 'v1' }),
		etag: null,
		expiresAt: Date.now() - 1000,
	})

	const res = await ghFetch(url, { fetchFn: mockFetch })
	assert.equal(fetchCalls, 1)
	const data = await res.json()
	assert.deepEqual(data, { version: 'v2' })

	const cached = cache.get(url)
	assert.equal(cached.etag, '"new-etag"')
})

test('max size: cache evicts oldest entry when exceeding max limit (200 entries)', async () => {
	const mockFetch = async (url) => {
		return new Response(JSON.stringify({ url }), {
			status: 200,
			headers: { etag: `etag-${url}` },
		})
	}

	// Insert 200 entries
	for (let i = 1; i <= MAX_CACHE_ENTRIES; i++) {
		cache.set(`https://api.github.com/entry-${i}`, {
			status: 200,
			statusText: 'OK',
			headers: {},
			body: JSON.stringify({ index: i }),
			etag: `etag-${i}`,
			expiresAt: Date.now() + CACHE_TTL_MS,
		})
	}

	assert.equal(cache.size, 200)
	assert.ok(cache.has('https://api.github.com/entry-1'))

	// Fetch 201st entry
	const url201 = 'https://api.github.com/entry-201'
	await ghFetch(url201, { fetchFn: mockFetch })

	// Size should not exceed 200
	assert.equal(cache.size, 200)
	// Oldest entry (entry-1) should have been evicted
	assert.equal(cache.has('https://api.github.com/entry-1'), false)
	// New entry (entry-201) should exist
	assert.ok(cache.has(url201))
})

test('do not cache errors: 404 or 500 responses are not cached', async () => {
	const mockFetch404 = async () => {
		return new Response(JSON.stringify({ message: 'Not Found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	const url404 = 'https://api.github.com/repos/test/nonexistent'
	const res404 = await ghFetch(url404, { fetchFn: mockFetch404 })
	assert.equal(res404.status, 404)
	assert.equal(cache.has(url404), false)

	const mockFetch500 = async () => {
		return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
			status: 500,
		})
	}

	const url500 = 'https://api.github.com/repos/test/server-error'
	const res500 = await ghFetch(url500, { fetchFn: mockFetch500 })
	assert.equal(res500.status, 500)
	assert.equal(cache.has(url500), false)
})
