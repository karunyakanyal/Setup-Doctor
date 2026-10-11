const zlib = require('zlib')
const tar = require('tar-stream')
const { Readable } = require('stream')
const { getGithubHeaders } = require('./github')

const ARCHIVE_CACHE = new Map()
const ARCHIVE_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ARCHIVE_CACHE_ENTRIES = 50

const MAX_COMPRESSED_BYTES = 30 * 1024 * 1024 // 30MB
const MAX_EXPANDED_BYTES = 120 * 1024 * 1024 // 120MB
const MAX_ENTRIES = 5000
const MAX_TEXT_PER_FILE_BYTES = 300 * 1024 // 300KB

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
		let totalFiles = 0
		let totalEntries = 0
		let totalCompressedBytes = 0
		let totalExpandedBytes = 0
		let hasAborted = false

		const extract = tar.extract()

		function abort(message, statusCode = 413) {
			if (hasAborted) return
			hasAborted = true
			const err = new Error(message)
			err.status = statusCode
			extract.destroy(err)
			if (gunzipStream) gunzipStream.destroy(err)
			if (inputStream && typeof inputStream.destroy === 'function') {
				inputStream.destroy(err)
			}
			reject(err)
		}

		let gunzipStream = null
		if (isGzip) {
			gunzipStream = zlib.createGunzip()
			gunzipStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Corrupt gzip stream', 400)
			})
		}

		extract.on('entry', (header, stream, next) => {
			stream.on('error', () => {})
			totalEntries++
			if (totalEntries > MAX_ENTRIES) {
				stream.resume()
				return abort('Repository archive exceeds entry limit of 5000 entries')
			}

			// Symlink handling: ignore and record
			if (header.type === 'symlink' || header.type === 'link') {
				skipped.symlink = (skipped.symlink || 0) + 1
				stream.resume()
				return next()
			}

			// Path traversal check on raw tar name
			if (isPathTraversal(header.name)) {
				skipped.path_traversal = (skipped.path_traversal || 0) + 1
				stream.resume()
				return next()
			}

			const cleanPath = stripTopLevelFolder(header.name)

			// Skip directory entries and empty paths resulting from root stripping
			if (header.type === 'directory' || !cleanPath || cleanPath.endsWith('/')) {
				stream.resume()
				return next()
			}

			// Path traversal check on stripped path
			if (isPathTraversal(cleanPath)) {
				skipped.path_traversal = (skipped.path_traversal || 0) + 1
				stream.resume()
				return next()
			}

			totalFiles++

			// Skip ignored directories (node_modules, dist, build, coverage, .git, vendor)
			if (isIgnoredDirectoryPath(cleanPath)) {
				skipped.ignored_directory = (skipped.ignored_directory || 0) + 1
				stream.resume()
				return next()
			}

			const chunks = []
			let fileExpandedBytes = 0

			stream.on('data', (chunk) => {
				if (hasAborted) return
				fileExpandedBytes += chunk.length
				totalExpandedBytes += chunk.length

				if (totalExpandedBytes > MAX_EXPANDED_BYTES) {
					return abort('Repository archive exceeds expanded size limit of 120MB')
				}

				chunks.push(chunk)
			})

			stream.on('end', () => {
				if (hasAborted) return

				const fileBuffer = Buffer.concat(chunks)
				const ext = cleanPath.split('.').pop()
				const isBinary = isBinaryExtension(ext) || containsNullByte(fileBuffer)
				const lang = isBinary ? 'binary' : detectLanguage(cleanPath)

				if (isBinary) {
					files.set(cleanPath, {
						size: fileBuffer.length,
						lang,
						text: null,
					})
				} else {
					if (fileBuffer.length > MAX_TEXT_PER_FILE_BYTES) {
						return abort(`File exceeds text size limit of 300KB: ${cleanPath}`)
					}
					files.set(cleanPath, {
						size: fileBuffer.length,
						lang,
						text: fileBuffer.toString('utf8'),
					})
				}

				next()
			})

			stream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Stream extraction error', 400)
			})
		})

		extract.on('finish', () => {
			if (hasAborted) return

			// Compute inventory
			const byLanguage = {}
			const byFolder = {}
			const allFilesList = []

			for (const [filePath, fileData] of files.entries()) {
				byLanguage[fileData.lang] = (byLanguage[fileData.lang] || 0) + 1
				const folder = getTopFolder(filePath)
				byFolder[folder] = (byFolder[folder] || 0) + 1
				allFilesList.push({
					path: filePath,
					size: fileData.size,
					lang: fileData.lang,
				})
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
				truncated: false,
			})
		})

		extract.on('error', (err) => {
			if (!hasAborted) abort(err.message || 'Tar extraction failed', 400)
		})

		// Track compressed bytes if gzip
		if (isGzip) {
			inputStream.on('data', (chunk) => {
				if (hasAborted) return
				totalCompressedBytes += chunk.length
				if (totalCompressedBytes > MAX_COMPRESSED_BYTES) {
					abort('Repository archive exceeds compressed size limit of 30MB')
				}
			})

			inputStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Input stream error', 400)
			})

			inputStream.pipe(gunzipStream).pipe(extract)
		} else {
			inputStream.on('data', (chunk) => {
				if (hasAborted) return
				totalCompressedBytes += chunk.length
				if (totalCompressedBytes > MAX_COMPRESSED_BYTES) {
					abort('Repository archive exceeds compressed size limit of 30MB')
				}
			})

			inputStream.on('error', (err) => {
				if (!hasAborted) abort(err.message || 'Input stream error', 400)
			})

			inputStream.pipe(extract)
		}
	})
}

/**
 * Downloads and parses repository archive from GitHub.
 */
async function fetchRepoArchive(owner, repo, ref, options = {}) {
	const cacheKey = `${owner}/${repo}/${ref}`
	const now = Date.now()
	const cached = ARCHIVE_CACHE.get(cacheKey)
	if (cached && now < cached.expiresAt) {
		return cached.data
	}

	const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`
	const fetchFn = options.fetchFn || globalThis.fetch
	const headers = getGithubHeaders()

	const response = await fetchFn(url, {
		headers,
		redirect: 'follow',
		signal: options.signal || AbortSignal.timeout(30000),
	})

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

	let nodeStream
	if (Buffer.isBuffer(response.body)) {
		nodeStream = Readable.from(response.body)
	} else if (response.body && typeof response.body.pipe === 'function') {
		nodeStream = response.body
	} else if (response.body && typeof response.body.getReader === 'function') {
		nodeStream = Readable.fromWeb(response.body)
	} else {
		nodeStream = Readable.from(response.body)
	}

	const result = await parseArchiveStream(nodeStream, { isGzip: true })

	if (ARCHIVE_CACHE.size >= MAX_ARCHIVE_CACHE_ENTRIES) {
		const oldestKey = ARCHIVE_CACHE.keys().next().value
		ARCHIVE_CACHE.delete(oldestKey)
	}
	ARCHIVE_CACHE.set(cacheKey, {
		data: result,
		expiresAt: Date.now() + ARCHIVE_CACHE_TTL_MS,
	})

	return result
}

function clearArchiveCache() {
	ARCHIVE_CACHE.clear()
}

function setArchiveCache(owner, repo, ref, data, ttlMs = ARCHIVE_CACHE_TTL_MS) {
	ARCHIVE_CACHE.set(`${owner}/${repo}/${ref}`, {
		data,
		expiresAt: Date.now() + ttlMs,
	})
}

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
}
