const cache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_CACHE_ENTRIES = 200

const getGithubHeaders = () => {
	const headers = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'SetupDoctor',
	}
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
	}
	return headers
}

const createCachedResponse = (cached) => {
	return new Response(cached.body, {
		status: cached.status,
		statusText: cached.statusText || 'OK',
		headers: cached.headers,
	})
}

const ghFetch = async (url, options = {}) => {
	const fetchFn = options.fetchFn || globalThis.fetch
	const now = Date.now()
	const cached = cache.get(url)

	// In-memory TTL cache hit: return cached entry if not expired
	if (cached && now < cached.expiresAt) {
		return createCachedResponse(cached)
	}

	const headers = {
		...getGithubHeaders(),
		...(options.headers || {}),
	}

	// Use stored ETags and If-None-Match for conditional revalidation
	if (cached && cached.etag) {
		headers['If-None-Match'] = cached.etag
	}

	const response = await fetchFn(url, {
		headers,
		signal: options.signal || AbortSignal.timeout(8000),
	})

	if (response.status === 429 || (response.status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0')) {
		const error = new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN.')
		error.status = 429
		throw error
	}

	// Treat 304 Not Modified as a cache hit
	if (response.status === 304 && cached) {
		cached.expiresAt = Date.now() + CACHE_TTL_MS
		// Re-insert into Map to maintain order
		cache.delete(url)
		cache.set(url, cached)
		return createCachedResponse(cached)
	}

	// Do not cache errors
	if (!response.ok) {
		return response
	}

	// Successful response (2xx): cache it
	const body = await response.text()
	const etag = response.headers?.get?.('etag') || null
	const headersObj = {}
	if (response.headers && typeof response.headers.forEach === 'function') {
		response.headers.forEach((val, key) => {
			headersObj[key] = val
		})
	}

	// Enforce max 200 entries: evict oldest entry
	if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(url)) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}

	const entry = {
		status: response.status,
		statusText: response.statusText,
		headers: headersObj,
		body,
		etag,
		expiresAt: Date.now() + CACHE_TTL_MS,
	}

	cache.set(url, entry)
	return createCachedResponse(entry)
}

const clearCache = () => {
	cache.clear()
}

module.exports = {
	getGithubHeaders,
	ghFetch,
	cache,
	clearCache,
	CACHE_TTL_MS,
	MAX_CACHE_ENTRIES,
}
