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

const TIMEOUT_MS = 15000
const TIMEOUT_ERROR_MESSAGE = 'GitHub took too long to respond. Try again in a moment.'

function isTimeoutError(err, timeoutSignal) {
	if (timeoutSignal?.aborted && (timeoutSignal.reason?.name === 'TimeoutError' || timeoutSignal.reason?.status === 502 || timeoutSignal.reason?.status === 504 || (typeof timeoutSignal.reason?.message === 'string' && /timeout|timed out|too long/i.test(timeoutSignal.reason.message)))) {
		return true
	}
	if (!err) return false
	if (err.name === 'TimeoutError' || err.status === 504) return true
	if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') return true
	if (err.name === 'AbortError' && (err.cause?.name === 'TimeoutError' || (timeoutSignal?.aborted && (timeoutSignal.reason?.name === 'TimeoutError' || timeoutSignal.reason?.status === 502)))) {
		return true
	}
	if (typeof err.message === 'string' && /timeout|timed out|too long/i.test(err.message)) {
		return true
	}
	return false
}

const ghFetch = async (url, options = {}) => {
	const fetchFn = options.fetchFn || globalThis.fetch
	const method = (options.method || 'GET').toUpperCase()
	const isGet = method === 'GET'
	const now = Date.now()
	const cached = cache.get(url)

	// In-memory TTL cache hit: return cached entry if not expired
	if (isGet && cached && now < cached.expiresAt) {
		return createCachedResponse(cached)
	}

	const headers = {
		...getGithubHeaders(),
		...(options.headers || {}),
	}

	// Use stored ETags and If-None-Match for conditional revalidation
	if (isGet && cached && cached.etag) {
		headers['If-None-Match'] = cached.etag
	}

	const timeoutDuration = options.timeout || TIMEOUT_MS
	const maxAttempts = isGet ? 2 : 1
	let lastError = null
	let lastWasTimeout = false

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		// If caller/overall signal already aborted, do not start an attempt
		if (options.signal?.aborted) {
			if (isTimeoutError(options.signal.reason, options.signal)) {
				const error = new Error(TIMEOUT_ERROR_MESSAGE)
				error.status = 502
				throw error
			}
			throw options.signal.reason || new Error('Request aborted')
		}

		const timeoutController = new AbortController()
		const timeoutTimer = setTimeout(() => {
			const err = new Error('The operation was aborted due to timeout')
			err.name = 'TimeoutError'
			err.status = 502
			timeoutController.abort(err)
		}, timeoutDuration)
		const timeoutSignal = timeoutController.signal
		let requestSignal = timeoutSignal
		if (options.signal) {
			if (typeof AbortSignal.any === 'function') {
				requestSignal = AbortSignal.any([options.signal, timeoutSignal])
			} else {
				requestSignal = options.signal
			}
		}

		try {
			const response = await fetchFn(url, {
				...options,
				headers,
				signal: requestSignal,
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
		} catch (err) {
			// Do not retry on 4xx (e.g. rate limit error with err.status = 429)
			if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
				throw err
			}

			const timedOut = isTimeoutError(err, timeoutSignal) || isTimeoutError(err, options.signal) || isTimeoutError(options.signal?.reason, options.signal)

			if (options.signal?.aborted && !isTimeoutError(options.signal.reason, timeoutSignal) && !timedOut) {
				throw err
			}

			lastError = err
			lastWasTimeout = timedOut

			// Do not start a retry attempt once the overall signal has aborted
			if (options.signal?.aborted) {
				if (timedOut || isTimeoutError(options.signal.reason, options.signal)) {
					const error = new Error(TIMEOUT_ERROR_MESSAGE)
					error.status = 502
					throw error
				}
				throw options.signal.reason || err
			}

			if (attempt < maxAttempts) {
				continue
			}

			if (lastWasTimeout) {
				const error = new Error(TIMEOUT_ERROR_MESSAGE)
				error.status = 502
				throw error
			}

			const error = new Error(lastError?.message || 'Unable to connect to the GitHub API')
			error.status = 502
			error.cause = lastError
			throw error
		} finally {
			clearTimeout(timeoutTimer)
		}
	}
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
	TIMEOUT_MS,
	TIMEOUT_ERROR_MESSAGE,
}
