import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRepository, validateRepositoryUrl } from './repository.js'

test('parseRepository: accepts "octocat/Hello-World"', () => {
  const result = parseRepository('octocat/Hello-World')
  assert.deepEqual(result, { owner: 'octocat', repo: 'Hello-World' })
  assert.equal(validateRepositoryUrl('octocat/Hello-World'), true)
})

test('parseRepository: accepts "https://github.com/karunyakanyal/Setup-Doctor.git" and strips .git', () => {
  const result = parseRepository('https://github.com/karunyakanyal/Setup-Doctor.git')
  assert.deepEqual(result, { owner: 'karunyakanyal', repo: 'Setup-Doctor' })
  assert.equal(validateRepositoryUrl('https://github.com/karunyakanyal/Setup-Doctor.git'), true)
})

test('parseRepository: accepts "github.com/o/r/tree/main/src" and normalizes to {owner, repo}', () => {
  const result = parseRepository('github.com/o/r/tree/main/src')
  assert.deepEqual(result, { owner: 'o', repo: 'r' })
  assert.equal(validateRepositoryUrl('github.com/o/r/tree/main/src'), true)
})

test('parseRepository: rejects non-GitHub host "https://gitlab.com/o/r"', () => {
  assert.throws(
    () => parseRepository('https://gitlab.com/o/r'),
    (err) => {
      assert.equal(err.message, 'Only github.com repositories are supported')
      return true
    },
  )
  assert.equal(validateRepositoryUrl('https://gitlab.com/o/r'), false)
})

test('parseRepository: rejects missing repo in "https://github.com/o"', () => {
  assert.throws(
    () => parseRepository('https://github.com/o'),
    (err) => {
      assert.equal(err.message, 'Enter owner/repo')
      return true
    },
  )
  assert.equal(validateRepositoryUrl('https://github.com/o'), false)
})

test('parseRepository: normalizes trailing slash, query, hash, and blob paths', () => {
  assert.deepEqual(parseRepository('owner/repo/'), { owner: 'owner', repo: 'repo' })
  assert.deepEqual(parseRepository('https://github.com/owner/repo?tab=readme'), { owner: 'owner', repo: 'repo' })
  assert.deepEqual(parseRepository('https://github.com/owner/repo#readme'), { owner: 'owner', repo: 'repo' })
  assert.deepEqual(parseRepository('https://github.com/owner/repo/blob/main/README.md'), { owner: 'owner', repo: 'repo' })
  assert.deepEqual(parseRepository('http://www.github.com/owner/repo'), { owner: 'owner', repo: 'repo' })
  assert.deepEqual(parseRepository('www.github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' })
})

test('parseRepository: rejects invalid characters in owner or repo', () => {
  assert.throws(() => parseRepository('bad*owner/repo'), { message: 'Invalid repository owner or name' })
  assert.throws(() => parseRepository('owner/bad*repo'), { message: 'Invalid repository owner or name' })
  assert.equal(validateRepositoryUrl('bad*owner/repo'), false)
})
