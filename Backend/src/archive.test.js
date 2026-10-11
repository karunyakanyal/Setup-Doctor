const assert = require('node:assert/strict')
const test = require('node:test')
const zlib = require('zlib')
const tar = require('tar-stream')
const { Readable } = require('stream')
const {
	parseArchiveStream,
	stripTopLevelFolder,
	isPathTraversal,
	detectLanguage,
	fetchRepoArchive,
} = require('./services/archive')

function createTarGzStream(entries = []) {
	const pack = tar.pack()
	for (const entry of entries) {
		pack.entry(entry.header, entry.content || '')
	}
	pack.finalize()
	const gzip = zlib.createGzip()
	return pack.pipe(gzip)
}

function sumSkipped(skipped = {}) {
	return Object.values(skipped).reduce((acc, count) => acc + count, 0)
}

test('archive helper: stripTopLevelFolder and detectLanguage', () => {
	assert.equal(stripTopLevelFolder('owner-repo-sha123/src/index.js'), 'src/index.js')
	assert.equal(stripTopLevelFolder('owner-repo/package.json'), 'package.json')
	assert.equal(stripTopLevelFolder('single-folder'), '')
	assert.equal(stripTopLevelFolder(''), '')

	assert.equal(detectLanguage('index.js'), 'javascript')
	assert.equal(detectLanguage('App.tsx'), 'tsx')
	assert.equal(detectLanguage('Component.vue'), 'vue')
	assert.equal(detectLanguage('styles.css'), 'css')
	assert.equal(detectLanguage('data.json'), 'json')
	assert.equal(detectLanguage('unknown.xyz'), 'xyz')
})

test('archive helper: isPathTraversal detection', () => {
	assert.equal(isPathTraversal('../secret.txt'), true)
	assert.equal(isPathTraversal('/etc/passwd'), true)
	assert.equal(isPathTraversal('src/../../root.txt'), true)
	assert.equal(isPathTraversal('src/normal/file.js'), false)
})

test('archive parser: strips top-level prefix and parses files in-memory', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'owner-repo-123/src/index.js' }, content: 'console.log("hello world");' },
		{ header: { name: 'owner-repo-123/package.json' }, content: '{"name": "test"}' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.ok(result.files.has('src/index.js'))
	assert.ok(result.files.has('package.json'))
	assert.equal(result.files.get('src/index.js').text, 'console.log("hello world");')
	assert.equal(result.files.get('src/index.js').lang, 'javascript')
	assert.equal(result.inventory.totalFiles, 2)
	assert.equal(result.inventory.analyzedFiles, 2)
	assert.equal(result.inventory.byFolder['src'], 1)
	assert.equal(result.inventory.byFolder['.'], 1)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: binary (extension and null byte)', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/assets/logo.png' }, content: Buffer.from([1, 2, 3, 4]) },
		{ header: { name: 'root/data/binary.dat' }, content: Buffer.from([65, 66, 0, 67]) }, // contains null byte
		{ header: { name: 'root/src/valid.js' }, content: 'const a = 1;' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.equal(result.inventory.skipped.binary, 2)
	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 3)
	assert.equal(result.files.has('assets/logo.png'), false)
	assert.equal(result.files.has('data/binary.dat'), false)
	assert.ok(result.files.has('src/valid.js'))
	assert.equal(result.inventory.byLanguage['binary'], 2)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: ignored_directory', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log(1)' },
		{ header: { name: 'root/node_modules/lodash/index.js' }, content: 'module.exports = {}' },
		{ header: { name: 'root/dist/bundle.js' }, content: 'bundle content' },
		{ header: { name: 'root/build/app.js' }, content: 'build content' },
		{ header: { name: 'root/coverage/lcov.info' }, content: 'TN:' },
		{ header: { name: 'root/.git/HEAD' }, content: 'ref: refs/heads/main' },
		{ header: { name: 'root/vendor/lib.js' }, content: 'vendor content' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.ok(result.files.has('src/index.js'))
	assert.equal(result.files.has('node_modules/lodash/index.js'), false)
	assert.equal(result.inventory.skipped.ignored_directory, 6)
	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 7)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: symlink', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log(1)' },
		{ header: { name: 'root/src/link.js', type: 'symlink', linkname: '../index.js' }, content: '' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.ok(result.files.has('src/index.js'))
	assert.equal(result.inventory.skipped.symlink, 1)
	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 2)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: path_traversal', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log(1)' },
		{ header: { name: 'root/../outside.js' }, content: 'malicious' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.ok(result.files.has('src/index.js'))
	assert.equal(result.files.has('../outside.js'), false)
	assert.equal(result.inventory.skipped.path_traversal, 1)
	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 2)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: size_limit (over 300KB does not abort, does not set truncated)', async () => {
	const hugeText = 'a'.repeat(301 * 1024) // 301 KB
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log("ok");' },
		{ header: { name: 'root/src/huge.js' }, content: hugeText },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.equal(result.truncated, false)
	assert.equal(result.inventory.skipped.size_limit, 1)
	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 2)
	assert.ok(result.files.has('src/index.js'))
	assert.equal(result.files.has('src/huge.js'), false)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive skip reason: entry_limit (past 5000 entries sets truncated: true and returns results)', async () => {
	const pack = tar.pack()
	for (let i = 0; i < 5005; i++) {
		pack.entry({ name: `root/file_${i}.txt` }, 'x')
	}
	pack.finalize()

	const result = await parseArchiveStream(pack, { isGzip: false })

	assert.equal(result.truncated, true)
	assert.equal(result.inventory.analyzedFiles, 5000)
	assert.equal(result.inventory.skipped.entry_limit, 5)
	assert.equal(result.inventory.totalFiles, 5005)
	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive mixed archive: all skip reasons combined and sum invariant holds', async () => {
	const hugeText = 'b'.repeat(301 * 1024)
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log("index");' },
		{ header: { name: 'root/src/utils.js' }, content: 'console.log("utils");' },
		{ header: { name: 'root/assets/logo.png' }, content: Buffer.from([1, 2, 3]) },
		{ header: { name: 'root/data/raw.bin' }, content: Buffer.from([10, 0, 20]) },
		{ header: { name: 'root/src/huge.js' }, content: hugeText },
		{ header: { name: 'root/node_modules/pkg/index.js' }, content: 'pkg' },
		{ header: { name: 'root/src/symlink.js', type: 'symlink', linkname: '../index.js' }, content: '' },
		{ header: { name: 'root/../escaped.js' }, content: 'escaped' },
		// Directory entries should be ignored and not counted in totalFiles
		{ header: { name: 'root/src/', type: 'directory' }, content: '' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.equal(result.inventory.totalFiles, 8)
	assert.equal(result.inventory.analyzedFiles, 2)
	assert.equal(result.inventory.skipped.binary, 2)
	assert.equal(result.inventory.skipped.size_limit, 1)
	assert.equal(result.inventory.skipped.ignored_directory, 1)
	assert.equal(result.inventory.skipped.symlink, 1)
	assert.equal(result.inventory.skipped.path_traversal, 1)
	assert.equal(result.truncated, false)

	assert.equal(result.inventory.analyzedFiles + sumSkipped(result.inventory.skipped), result.inventory.totalFiles)
})

test('archive parser cap: aborts compressed stream during streaming when exceeding 30MB', async () => {
	let chunksEmitted = 0
	let totalBytesEmitted = 0
	const oneMbChunk = Buffer.alloc(1024 * 1024, 0)

	const stream = new Readable({
		read() {
			if (this.destroyed) return
			if (chunksEmitted < 35) {
				chunksEmitted++
				totalBytesEmitted += oneMbChunk.length
				this.push(oneMbChunk)
			} else {
				this.push(null)
			}
		},
	})

	let onAbortCalled = false
	await assert.rejects(
		async () => {
			await parseArchiveStream(stream, {
				isGzip: false,
				onAbort: () => {
					onAbortCalled = true
				},
			})
		},
		(err) => {
			assert.equal(err.status, 413)
			assert.ok(err.message.includes('30MB'))
			return true
		},
	)

	assert.equal(onAbortCalled, true)
	assert.ok(chunksEmitted < 35, `Should abort before emitting all chunks (emitted: ${chunksEmitted})`)
})

test('archive parser cap: aborts expanded bytes when exceeding 120MB', async () => {
	const pack = tar.pack()
	const largeChunk = Buffer.alloc(10 * 1024 * 1024, 1)
	const entry = pack.entry({ name: 'root/huge.txt', size: 13 * 10 * 1024 * 1024 })
	for (let i = 0; i < 13; i++) {
		entry.write(largeChunk)
	}
	entry.end()
	pack.finalize()

	const gzip = zlib.createGzip()
	const gzippedStream = pack.pipe(gzip)

	await assert.rejects(
		async () => {
			await parseArchiveStream(gzippedStream, { isGzip: true })
		},
		(err) => {
			assert.equal(err.status, 413)
			assert.ok(err.message.includes('120MB'))
			return true
		},
	)
})

test('fetchRepoArchive: stalled headers response hits timeout and rejects with 504', async () => {
	const mockFetch = async (url, options) => {
		return new Promise((resolve, reject) => {
			if (options.signal) {
				options.signal.addEventListener(
					'abort',
					() => {
						const err = new Error('The operation was aborted due to timeout')
						err.name = 'TimeoutError'
						reject(err)
					},
					{ once: true },
				)
			}
		})
	}

	await assert.rejects(
		async () => {
			await fetchRepoArchive('owner', 'repo', 'main', {
				fetchFn: mockFetch,
				connectTimeoutMs: 50,
			})
		},
		(err) => {
			assert.equal(err.status, 504)
			assert.equal(err.message, 'Repository download took too long.')
			return true
		},
	)
})

test('fetchRepoArchive: stalled archive stream hits deadline, destroys stream, and rejects with 504', async () => {
	let streamDestroyed = false
	const stalledStream = new Readable({
		read() {
			// Don't push any data - stream stalls
		},
		destroy(err, cb) {
			streamDestroyed = true
			if (cb) cb(err)
		},
	})

	const mockFetch = async () => {
		return {
			ok: true,
			status: 200,
			headers: { get: () => null },
			body: stalledStream,
		}
	}

	await assert.rejects(
		async () => {
			await fetchRepoArchive('owner', 'repo', 'main', {
				fetchFn: mockFetch,
				totalTimeoutMs: 50,
			})
		},
		(err) => {
			assert.equal(err.status, 504)
			assert.equal(err.message, 'Repository download took too long.')
			return true
		},
	)

	assert.equal(streamDestroyed, true)
})

