const test = require('node:test')
const assert = require('node:assert/strict')
const { parseRepository } = require('../../shared/repository')

test('parseRepository: accepts "octocat/Hello-World"', () => {
	const result = parseRepository('octocat/Hello-World')
	assert.deepEqual(result, { owner: 'octocat', repo: 'Hello-World' })
})

test('parseRepository: accepts "https://github.com/karunyakanyal/Setup-Doctor.git" and strips .git', () => {
	const result = parseRepository('https://github.com/karunyakanyal/Setup-Doctor.git')
	assert.deepEqual(result, { owner: 'karunyakanyal', repo: 'Setup-Doctor' })
})

test('parseRepository: accepts "github.com/o/r/tree/main/src" and normalizes to {owner, repo}', () => {
	const result = parseRepository('github.com/o/r/tree/main/src')
	assert.deepEqual(result, { owner: 'o', repo: 'r' })
})

test('parseRepository: rejects non-GitHub host "https://gitlab.com/o/r"', () => {
	assert.throws(
		() => parseRepository('https://gitlab.com/o/r'),
		(err) => {
			assert.equal(err.message, 'Only github.com repositories are supported')
			return true
		}
	)
})

test('parseRepository: rejects missing repo in "https://github.com/o"', () => {
	assert.throws(
		() => parseRepository('https://github.com/o'),
		(err) => {
			assert.equal(err.message, 'Enter owner/repo')
			return true
		}
	)
})

test('parseRepository: normalizes trailing slash, query, hash, and blob paths', () => {
	assert.deepEqual(parseRepository('owner/repo/'), { owner: 'owner', repo: 'repo' })
	assert.deepEqual(parseRepository('https://github.com/owner/repo?tab=readme'), { owner: 'owner', repo: 'repo' })
	assert.deepEqual(parseRepository('https://github.com/owner/repo#readme'), { owner: 'owner', repo: 'repo' })
	assert.deepEqual(parseRepository('https://github.com/owner/repo/blob/main/README.md'), { owner: 'owner', repo: 'repo' })
	assert.deepEqual(parseRepository('http://www.github.com/owner/repo'), { owner: 'owner', repo: 'repo' })
	assert.deepEqual(parseRepository('www.github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' })
})

test('parseRepository: rejects missing input or non-github host without scheme', () => {
	assert.throws(() => parseRepository(''), { message: 'Enter owner/repo' })
	assert.throws(() => parseRepository('   '), { message: 'Enter owner/repo' })
	assert.throws(() => parseRepository('justowner'), { message: 'Enter owner/repo' })
	assert.throws(() => parseRepository('gitlab.com/o/r'), { message: 'Only github.com repositories are supported' })
})

test('parseRepository: rejects invalid characters in owner or repo', () => {
	assert.throws(() => parseRepository('bad*owner/repo'), { message: 'Invalid repository owner or name' })
	assert.throws(() => parseRepository('owner/bad*repo'), { message: 'Invalid repository owner or name' })
	assert.throws(() => parseRepository('owner/repo with space'), { message: 'Invalid repository owner or name' })
})
