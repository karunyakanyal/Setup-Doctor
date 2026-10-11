const zlib = require('zlib')
const tar = require('tar-stream')
const { Readable, Transform } = require('stream')
const { getGithubHeaders } = require('./github')

const MAX_COMPRESSED_BYTES = 30 * 1024 * 1024 // 30MB
const MAX_EXPANDED_BYTES = 120 * 1024 * 1024 // 120MB
const MAX_ENTRIES = 5000
const MAX_TEXT_PER_FILE_BYTES = 300 * 1024 // 300KB
const ARCHIVE_CONNECT_TIMEOUT_MS = 30000
const ARCHIVE_TOTAL_TIMEOUT_MS = 60000
const ARCHIVE_TIMEOUT_MESSAGE = 'Repository download took too long.'

function isArchiveTimeoutError(err, signal) {
	if (signal?.aborted && (signal.reason?.name === 'TimeoutError' || signal.reason?.status === 504 || (typeof signal.reason?.message === 'string' && /timeout|timed out|took too long/i.test(signal.reason.message)))) {
		return true
	}
	if (!err) return false
	if (err.name === 'TimeoutError' || err.status === 504) return true
	if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') return true
	if (err.name === 'AbortError' && (err.cause?.name === 'TimeoutError' || (signal?.aborted && (signal.reason?.name === 'TimeoutError' || signal.reason?.status === 504)))) {
		return true
	}
	if (typeof err.message === 'string' && /timeout|timed out|took too long/i.test(err.message)) {
		return true
	}
	return false
}

function createCompressedLimiter(maxBytes, onLimitExceeded) {
	let bytes = 0
	return new Transform({
		transform(chunk, encoding, callback) {
			bytes += chunk.length
			if (bytes > maxBytes) {
				const err = onLimitExceeded(bytes)
				return callback(err)
			}
			callback(null, chunk)
		},
	})
}

const BINARY_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'psd', 'avif',
	'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov', 'flac', 'webm', 'm4a', 'mkv',
	'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz',
	'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'obj', 'o', 'a',
	'woff', 'woff2', 'ttf', 'eot', 'otf',
	'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
	'wasm', 'pyc', 'class', 'jar', 'db', 'sqlite', 'lockb',
])

const IGNORED_FOLDERS = new Set([
	'node_modules',
	'dist',
	'build',
	'coverage',
	'.git',
	'vendor',
])

function isBinaryExtension(ext) {
	return BINARY_EXTENSIONS.has((ext || '').toLowerCase())
}

function containsNullByte(buffer) {
	for (let i = 0; i < buffer.length; i++) {
		if (buffer[i] === 0) return true
	}
	return false
}

function detectLanguage(filePath) {
	const ext = filePath.split('.').pop().toLowerCase()
	switch (ext) {
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'javascript'
		case 'jsx':
			return 'jsx'
		case 'ts':
		case 'mts':
		case 'cts':
			return 'typescript'
		case 'tsx':
			return 'tsx'
		case 'vue':
			return 'vue'
		case 'json':
			return 'json'
		case 'md':
		case 'markdown':
			return 'markdown'
		case 'html':
		case 'htm':
			return 'html'
		case 'css':
		case 'scss':
		case 'sass':
		case 'less':
			return 'css'
		case 'py':
			return 'python'
		case 'go':
			return 'go'
		case 'rs':
			return 'rust'
		case 'java':
			return 'java'
		case 'c':
		case 'h':
			return 'c'
		case 'cpp':
		case 'hpp':
		case 'cc':
		case 'cxx':
			return 'cpp'
		case 'rb':
			return 'ruby'
		case 'php':
			return 'php'
		case 'sh':
		case 'bash':
			return 'shell'
		case 'yml':
		case 'yaml':
			return 'yaml'
		default:
			return ext || 'other'
	}
}

function stripTopLevelFolder(tarPath) {
	const normalized = (tarPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
	const firstSlash = normalized.indexOf('/')
	if (firstSlash === -1) {
		return ''
	}
	return normalized.slice(firstSlash + 1)
}

function isPathTraversal(pathStr) {
	if (!pathStr || typeof pathStr !== 'string') return true
	const normalized = pathStr.replace(/\\/g, '/')
	if (normalized.startsWith('/') || normalized.startsWith('../') || normalized === '..') {
		return true
	}
	const parts = normalized.split('/')
	for (const part of parts) {
		if (part === '..') return true
	}
	return false
}

function isIgnoredDirectoryPath(cleanPath) {
	const parts = cleanPath.split('/')
	for (const part of parts) {
		if (IGNORED_FOLDERS.has(part)) return true
	}
	return false
}

function getTopFolder(cleanPath) {
	const firstSlash = cleanPath.indexOf('/')
	if (firstSlash === -1) {
		return '.'
	}
	return cleanPath.slice(0, firstSlash)
}

/**
 * Parses a tar stream (optionally gzipped), enforcing caps and memory-only storage.
 */
function parseArchiveStream(inputStream, options = {}) {
	return new Promise((resolve, reject) => {
		const isGzip = options.isGzip !== false
		const files = new Map()
		const skipped = {}
		const byLanguage = {}
		const byFolder = {}
		const allFilesList = []
		let totalFiles = 0
		let totalCompressedBytes = 0
		let totalExpandedBytes = 0
		let hasAborted = false
		let truncated = false
		let gunzipStream = null
		let onSignalAbort = null

		const extract = tar.extract()

		const limiter = createCompressedLimiter(MAX_COMPRESSED_BYTES, () => {
			const err = new Error('Repository archive exceeds compressed size limit of 30MB')
			err.status = 413
			abort(err.message, 413)
			return err
		})
		limiter.on('error', () => {})

		if (isGzip) {
			gunzipStream = zlib.createGunzip()
			gunzipStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Corrupt gzip stream', 400)
			})
		}

		function abort(messageOrError, statusCode = 413) {
			if (hasAborted) return
			hasAborted = true
			if (options.signal && onSignalAbort) {
				options.signal.removeEventListener('abort', onSignalAbort)
			}
			const err = messageOrError instanceof Error ? messageOrError : new Error(messageOrError)
			if (typeof statusCode === 'number' && !err.status) {
				err.status = statusCode
			}
			if (typeof options.onAbort === 'function') {
				try {
					options.onAbort(err)
				} catch {}
			}
			limiter.destroy(err)
			extract.destroy(err)
			if (gunzipStream) gunzipStream.destroy(err)
			if (inputStream && typeof inputStream.destroy === 'function') {
				inputStream.destroy(err)
			}
			reject(err)
		}

		if (options.signal) {
			onSignalAbort = () => {
				const reason = options.signal.reason
				abort(reason || ARCHIVE_TIMEOUT_MESSAGE, reason?.status || 504)
			}
			if (options.signal.aborted) {
				onSignalAbort()
			} else {
				options.signal.addEventListener('abort', onSignalAbort, { once: true })
			}
		}

		extract.on('entry', (header, stream, next) => {
			stream.on('error', () => {})

			// Directory entries are not counted
			if (header.type === 'directory' || header.name.endsWith('/')) {
				stream.resume()
				return next()
			}

			const cleanPath = stripTopLevelFolder(header.name)
			if (!cleanPath || cleanPath.endsWith('/')) {
				stream.resume()
				return next()
			}

			// 1. Increment totalFiles for every tar entry that is a regular file, before any skip check
			totalFiles++

			// 2. entry_limit (past 5000 entries)
			if (totalFiles > MAX_ENTRIES) {
				skipped.entry_limit = (skipped.entry_limit || 0) + 1
				truncated = true
				stream.resume()
				return next()
			}

			// 3. symlink
			if (header.type === 'symlink' || header.type === 'link') {
				skipped.symlink = (skipped.symlink || 0) + 1
				stream.resume()
				return next()
			}

			// 4. path_traversal
			if (isPathTraversal(header.name) || isPathTraversal(cleanPath)) {
				skipped.path_traversal = (skipped.path_traversal || 0) + 1
				stream.resume()
				return next()
			}

			// 5. ignored_directory
			if (isIgnoredDirectoryPath(cleanPath)) {
				skipped.ignored_directory = (skipped.ignored_directory || 0) + 1
				stream.resume()
				return next()
			}

			// 6. Fast-path binary extension check
			const ext = cleanPath.split('.').pop()
			if (isBinaryExtension(ext)) {
				skipped.binary = (skipped.binary || 0) + 1
				let fileSize = 0

				stream.on('data', (chunk) => {
					if (hasAborted) return
					fileSize += chunk.length
					totalExpandedBytes += chunk.length
					if (totalExpandedBytes > MAX_EXPANDED_BYTES) {
						return abort('Repository archive exceeds expanded size limit of 120MB')
					}
				})

				stream.on('end', () => {
					if (hasAborted) return
					allFilesList.push({
						path: cleanPath,
						size: fileSize,
						lang: 'binary',
					})
					byLanguage['binary'] = (byLanguage['binary'] || 0) + 1
					const folder = getTopFolder(cleanPath)
					byFolder[folder] = (byFolder[folder] || 0) + 1
					next()
				})

				stream.on('error', (err) => {
					if (!hasAborted) abort(err.message || 'Stream extraction error', 400)
				})
				return
			}

			// 7. Non-binary extension: buffer up to MAX_TEXT_PER_FILE_BYTES, check null bytes
			const chunks = []
			let fileSize = 0
			let isBinaryContent = false
			let isSizeLimit = false

			stream.on('data', (chunk) => {
				if (hasAborted) return
				fileSize += chunk.length
				totalExpandedBytes += chunk.length

				if (totalExpandedBytes > MAX_EXPANDED_BYTES) {
					return abort('Repository archive exceeds expanded size limit of 120MB')
				}

				if (!isBinaryContent && containsNullByte(chunk)) {
					isBinaryContent = true
				}

				if (!isBinaryContent && fileSize > MAX_TEXT_PER_FILE_BYTES) {
					isSizeLimit = true
				}

				if (!isSizeLimit && !isBinaryContent) {
					chunks.push(chunk)
				}
			})

			stream.on('end', () => {
				if (hasAborted) return

				if (isBinaryContent) {
					skipped.binary = (skipped.binary || 0) + 1
					allFilesList.push({
						path: cleanPath,
						size: fileSize,
						lang: 'binary',
					})
					byLanguage['binary'] = (byLanguage['binary'] || 0) + 1
					const folder = getTopFolder(cleanPath)
					byFolder[folder] = (byFolder[folder] || 0) + 1
					return next()
				}

				if (isSizeLimit) {
					skipped.size_limit = (skipped.size_limit || 0) + 1
					const lang = detectLanguage(cleanPath)
					allFilesList.push({
						path: cleanPath,
						size: fileSize,
						lang,
					})
					byLanguage[lang] = (byLanguage[lang] || 0) + 1
					const folder = getTopFolder(cleanPath)
					byFolder[folder] = (byFolder[folder] || 0) + 1
					return next()
				}

				// Regular analyzed text file
				const fileBuffer = Buffer.concat(chunks)
				const lang = detectLanguage(cleanPath)
				files.set(cleanPath, {
					size: fileBuffer.length,
					lang,
					text: fileBuffer.toString('utf8'),
				})
				allFilesList.push({
					path: cleanPath,
					size: fileBuffer.length,
					lang,
				})
				byLanguage[lang] = (byLanguage[lang] || 0) + 1
				const folder = getTopFolder(cleanPath)
				byFolder[folder] = (byFolder[folder] || 0) + 1

				next()
			})

			stream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Stream extraction error', 400)
			})
		})

		extract.on('finish', () => {
			if (hasAborted) return
			if (options.signal && onSignalAbort) {
				options.signal.removeEventListener('abort', onSignalAbort)
			}

			allFilesList.sort((a, b) => b.size - a.size)
			const largest = allFilesList.slice(0, 10)

			const inventory = {
				byLanguage,
				byFolder,
				largest,
				totalFiles,
				analyzedFiles: files.size,
				skipped,
			}

			resolve({
				files,
				inventory,
				truncated,
			})
		})

		extract.on('error', (err) => {
			if (!hasAborted) abort(err.message || 'Tar extraction failed', 400)
		})

		if (isGzip) {
			inputStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Input stream error', 400)
			})

			inputStream.pipe(limiter).pipe(gunzipStream).pipe(extract)
		} else {
			inputStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Input stream error', 400)
			})

			inputStream.pipe(limiter).pipe(extract)
		}
	})
}

/**
 * Downloads and parses repository archive from GitHub.
 */
async function fetchRepoArchive(owner, repo, ref, options = {}) {
	const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`
	const fetchFn = options.fetchFn || options.fetch || globalThis.fetch
	const headers = getGithubHeaders()

	const connectTimeoutMs = options.connectTimeoutMs ?? options.connectTimeout ?? options.headerTimeoutMs ?? options.headerTimeout ?? ARCHIVE_CONNECT_TIMEOUT_MS
	const totalTimeoutMs = options.totalTimeoutMs ?? options.totalTimeout ?? options.deadlineTimeoutMs ?? options.deadlineTimeout ?? ARCHIVE_TOTAL_TIMEOUT_MS

	const abortController = new AbortController()
	if (options.signal) {
		if (options.signal.aborted) {
			abortController.abort(options.signal.reason)
		} else {
			options.signal.addEventListener('abort', () => abortController.abort(options.signal.reason), { once: true })
		}
	}

	let totalTimeoutTriggered = false
	let nodeStream = null

	const destroyStreams = (err) => {
		if (nodeStream && typeof nodeStream.destroy === 'function' && !nodeStream.destroyed) {
			nodeStream.destroy(err)
		}
	}

	let totalTimer = null
	const totalPromise = new Promise((_, reject) => {
		totalTimer = setTimeout(() => {
			totalTimeoutTriggered = true
			const err = new Error(ARCHIVE_TIMEOUT_MESSAGE)
			err.status = 504
			abortController.abort(err)
			destroyStreams(err)
			reject(err)
		}, totalTimeoutMs)
		if (totalTimer && typeof totalTimer.unref === 'function') {
			totalTimer.unref()
		}
	})

	const headersTimeoutSignal = AbortSignal.timeout(connectTimeoutMs)
	let fetchSignal
	if (typeof AbortSignal.any === 'function') {
		fetchSignal = AbortSignal.any([abortController.signal, headersTimeoutSignal])
	} else {
		fetchSignal = abortController.signal
	}

	try {
		return await Promise.race([
			(async () => {
				let response
				try {
					response = await fetchFn(url, {
						headers,
						redirect: 'follow',
						signal: fetchSignal,
					})
				} catch (fetchErr) {
					if (headersTimeoutSignal.aborted || totalTimeoutTriggered || isArchiveTimeoutError(fetchErr, headersTimeoutSignal)) {
						const timeoutErr = new Error(ARCHIVE_TIMEOUT_MESSAGE)
						timeoutErr.status = 504
						abortController.abort(timeoutErr)
						throw timeoutErr
					}
					throw fetchErr
				}

				if (
					response.status === 429 ||
					(response.status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0')
				) {
					const error = new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN.')
					error.status = 429
					throw error
				}

				if (response.status === 404) {
					const error = new Error('GitHub repository or ref not found')
					error.status = 404
					throw error
				}

				if (!response.ok) {
					const error = new Error('GitHub API request failed')
					error.status = 502
					throw error
				}

				const contentLength = Number(response.headers?.get?.('content-length'))
				if (contentLength && contentLength > MAX_COMPRESSED_BYTES) {
					abortController.abort()
					const error = new Error('Repository archive exceeds compressed size limit of 30MB')
					error.status = 413
					throw error
				}

				if (Buffer.isBuffer(response.body)) {
					nodeStream = Readable.from(response.body)
				} else if (response.body && typeof response.body.pipe === 'function') {
					nodeStream = response.body
				} else if (response.body && typeof response.body.getReader === 'function') {
					nodeStream = Readable.fromWeb(response.body)
				} else {
					nodeStream = Readable.from(response.body)
				}

				const result = await parseArchiveStream(nodeStream, {
					isGzip: true,
					signal: abortController.signal,
					onAbort: () => {
						abortController.abort()
					},
				})

				return result
			})(),
			totalPromise,
		])
	} catch (err) {
		destroyStreams(err)
		abortController.abort(err)
		if (totalTimeoutTriggered || headersTimeoutSignal.aborted || isArchiveTimeoutError(err, headersTimeoutSignal)) {
			const timeoutErr = new Error(ARCHIVE_TIMEOUT_MESSAGE)
			timeoutErr.status = 504
			throw timeoutErr
		}
		throw err
	} finally {
		clearTimeout(totalTimer)
	}
}

function clearArchiveCache() {}

function setArchiveCache() {}

module.exports = {
	fetchRepoArchive,
	parseArchiveStream,
	clearArchiveCache,
	setArchiveCache,
	detectLanguage,
	stripTopLevelFolder,
	isPathTraversal,
	isIgnoredDirectoryPath,
	MAX_COMPRESSED_BYTES,
	MAX_EXPANDED_BYTES,
	MAX_ENTRIES,
	MAX_TEXT_PER_FILE_BYTES,
	ARCHIVE_CONNECT_TIMEOUT_MS,
	ARCHIVE_TOTAL_TIMEOUT_MS,
	ARCHIVE_TIMEOUT_MESSAGE,
}
