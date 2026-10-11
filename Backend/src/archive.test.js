const assert = require('node:assert/strict')
const test = require('node:test')
const zlib = require('zlib')
const tar = require('tar-stream')
const { Readable } = require('stream')
const {
	parseArchiveStream,
	clearArchiveCache,
	stripTopLevelFolder,
	isPathTraversal,
	detectLanguage,
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
})

test('archive parser: binary detection via extension and null byte', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/assets/logo.png' }, content: Buffer.from([1, 2, 3, 4]) },
		{ header: { name: 'root/data/binary.dat' }, content: Buffer.from([65, 66, 0, 67]) }, // contains null byte
		{ header: { name: 'root/src/valid.js' }, content: 'const a = 1;' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	const png = result.files.get('assets/logo.png')
	assert.ok(png)
	assert.equal(png.text, null)
	assert.equal(png.lang, 'binary')
	assert.equal(png.size, 4)

	const dat = result.files.get('data/binary.dat')
	assert.ok(dat)
	assert.equal(dat.text, null)
	assert.equal(dat.lang, 'binary')

	const js = result.files.get('src/valid.js')
	assert.ok(js)
	assert.equal(js.text, 'const a = 1;')
	assert.equal(js.lang, 'javascript')
})

test('archive parser: skips ignored directories (node_modules, dist, build, coverage, .git, vendor)', async () => {
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
	assert.equal(result.files.has('dist/bundle.js'), false)
	assert.equal(result.files.has('build/app.js'), false)
	assert.equal(result.files.has('coverage/lcov.info'), false)
	assert.equal(result.files.has('.git/HEAD'), false)
	assert.equal(result.files.has('vendor/lib.js'), false)

	assert.equal(result.inventory.analyzedFiles, 1)
	assert.equal(result.inventory.totalFiles, 7)
	assert.equal(result.inventory.skipped.ignored_directory, 6)
})

test('archive parser: ignores symlinks and path traversal safely', async () => {
	const stream = createTarGzStream([
		{ header: { name: 'root/src/index.js' }, content: 'console.log(1)' },
		{ header: { name: 'root/src/link.js', type: 'symlink', linkname: '../index.js' }, content: '' },
		{ header: { name: 'root/../outside.js' }, content: 'malicious' },
	])

	const result = await parseArchiveStream(stream, { isGzip: true })

	assert.ok(result.files.has('src/index.js'))
	assert.equal(result.files.has('../outside.js'), false)
	assert.equal(result.inventory.skipped.symlink, 1)
	assert.equal(result.inventory.skipped.path_traversal, 1)
})

test('archive parser cap: aborts when text per file exceeds 300KB', async () => {
	const hugeText = 'a'.repeat(301 * 1024) // 301 KB
	const stream = createTarGzStream([
		{ header: { name: 'root/src/huge.js' }, content: hugeText },
	])

	await assert.rejects(
		async () => {
			await parseArchiveStream(stream, { isGzip: true })
		},
		(err) => {
			assert.equal(err.status, 413)
			assert.ok(err.message.includes('300KB'))
			return true
		},
	)
})

test('archive parser cap: aborts when entries exceed 5000', async () => {
	const pack = tar.pack()
	for (let i = 0; i < 5005; i++) {
		pack.entry({ name: `root/file_${i}.txt` }, 'x')
	}
	pack.finalize()

	await assert.rejects(
		async () => {
			await parseArchiveStream(pack, { isGzip: false })
		},
		(err) => {
			assert.equal(err.status, 413)
			assert.ok(err.message.includes('5000'))
			return true
		},
	)
})
