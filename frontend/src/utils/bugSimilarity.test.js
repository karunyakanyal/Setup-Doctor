import assert from 'node:assert/strict'
import test from 'node:test'
import { findSimilarBugs, groupSimilarBugs } from './bugSimilarity.js'

const message = 'The project does not specify a Node.js version requirement.'
const savedBug = {
  id: 1,
  problem: 'Node version mismatch',
  error: 'Unsupported runtime detected during installation',
  cause: 'Local environment differs from deployment configuration',
  solution: 'Set engines.node in package.json.',
}

test('Node warning matches a saved problem despite additional error/cause details', () => {
  const results = findSimilarBugs({
    problem: message,
    error: message,
    cause: '',
    bugs: [savedBug],
    limit: 3,
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].bug, savedBug)
  assert.equal(results[0].bug.solution, savedBug.solution)
})

test('still matches supporting details when the saved title differs', () => {
  const bug = { ...savedBug, problem: 'Install failed', error: message }
  assert.equal(findSimilarBugs({ problem: message, bugs: [bug] })[0].bug, bug)
})

test('unrelated entries and empty input do not produce suggestions', () => {
  assert.deepEqual(findSimilarBugs({ problem: 'Database authentication failed', bugs: [savedBug] }), [])
  assert.deepEqual(findSimilarBugs({ bugs: [savedBug] }), [])
  assert.deepEqual(findSimilarBugs({ problem: message, bugs: [] }), [])
})

test('keeps results ranked and limited without mutating saved entries', () => {
  const bugs = [savedBug, ...[2, 3, 4].map((id) => ({ ...savedBug, id, problem: message }))]
  const before = structuredClone(bugs)
  const results = findSimilarBugs({ problem: message, bugs, limit: 3 })
  assert.deepEqual(results.map(({ bug }) => bug.id), [2, 3, 4])
  assert.deepEqual(bugs, before)
})

test('Node.js classification: Entry A is a Likely duplicate and Entry B is a Related issue', () => {
  const incoming = {
    problem: 'Node.js version requirement is missing',
    error: 'The project does not specify a Node.js version requirement.',
    suggestedFix: 'Add an engines.node field to package.json.',
    ruleId: 'node-engine',
  }

  const entryA = {
    id: 101,
    problem: 'Missing Nvmrc Or Engines',
    error: 'Project does not specify a Node.js version via package.json engines or .nvmrc.',
    suggestedFix: 'Add an engines.node requirement.',
  }

  const entryB = {
    id: 102,
    problem: 'Node version mismatch',
    error: 'The engine "node" is incompatible with this module.',
    verifiedSolution: 'Use Node.js 20 and run npm install again.',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [entryA, entryB],
  })

  assert.equal(results.length, 2)

  // Find match for Entry A
  const matchA = results.find((r) => r.bug.id === 101)
  assert.ok(matchA, 'Entry A must be matched')
  assert.equal(matchA.matchLevel, 'strong', 'Entry A must be classified as Likely duplicate')
  assert.equal(matchA.badgeLabel, 'Likely duplicate')
  assert.match(matchA.matchReason, /Node\.js version|engines\.node|unconfigured/i)

  // Find match for Entry B
  const matchB = results.find((r) => r.bug.id === 102)
  assert.ok(matchB, 'Entry B must be matched')
  assert.equal(matchB.matchLevel, 'related', 'Entry B must be classified as Related issue')
  assert.equal(matchB.badgeLabel, 'Related issue')
  assert.match(matchB.matchReason, /incompatibility|differs|differ/i)

  // Verify group separation
  const { likelyDuplicates, relatedIssues } = groupSimilarBugs(results)
  assert.equal(likelyDuplicates.length, 1)
  assert.equal(likelyDuplicates[0].bug.id, 101)
  assert.equal(relatedIssues.length, 1)
  assert.equal(relatedIssues[0].bug.id, 102)
})

test('identical titles with genuinely different underlying errors are classified as related issues', () => {
  const incoming = {
    problem: 'Build failed',
    error: 'SyntaxError: Unexpected token < in src/App.jsx',
  }

  const saved = {
    id: 201,
    problem: 'Build failed',
    error: 'JavaScript heap out of memory in bundle chunks',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [saved],
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].matchLevel, 'related', 'Different underlying errors must not be marked as duplicates')
  assert.equal(results[0].badgeLabel, 'Related issue')
  assert.match(results[0].matchReason, /symptoms differ|differ/i)
})

test('similar titles with different causes or solutions are classified as related issues', () => {
  const incoming = {
    problem: 'Docker container startup error',
    error: 'Port 5000 is already in use',
    cause: 'Another service is listening on port 5000',
    suggestedFix: 'Kill existing process on port 5000',
  }

  const saved = {
    id: 202,
    problem: 'Docker container startup error',
    error: 'Cannot find module /app/dist/server.js',
    cause: 'Build step was skipped before container start',
    verifiedSolution: 'Run npm run build before docker compose up',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [saved],
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].matchLevel, 'related')
  assert.equal(results[0].badgeLabel, 'Related issue')
})

test('matching diagnostic rule IDs with supporting error evidence strengthen a match', () => {
  const incoming = {
    problem: 'Missing Node version',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'node-engine',
  }

  const saved = {
    id: 203,
    problem: 'Node engine missing in package',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'node-engine',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [saved],
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
  assert.match(results[0].matchReason, /node-engine/)
})

test('generic-word overlap alone results in no match', () => {
  const incoming = {
    problem: 'Package script failure',
    error: 'Failed to run dev script',
  }

  const saved = {
    id: 204,
    problem: 'Package build failure',
    error: 'Failed to run test script',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [saved],
  })

  assert.deepEqual(results, [], 'Generic-word overlap alone must not match')
})

test('Missing LICENSE versus Node.js version requirement results in no match', () => {
  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const existing = {
    id: 301,
    problem: 'Missing Nvmrc Or Engines',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'missing-nvmrc-or-engines',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.deepEqual(results, [], 'Missing LICENSE must not match Node version requirement')
})

test('Missing LICENSE versus missing .env.example results in no match', () => {
  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const existing = {
    id: 302,
    problem: 'Environment example file is missing',
    error: '.env.example is missing; add one if the project needs environment variables.',
    ruleId: 'environment-example',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.deepEqual(results, [], 'Missing LICENSE must not match missing .env.example')
})

test('Missing LICENSE versus missing test script results in no match', () => {
  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const existing = {
    id: 303,
    problem: 'Missing Test Script',
    error: 'No test script specified in package.json.',
    ruleId: 'missing-test-script',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.deepEqual(results, [], 'Missing LICENSE must not match missing test script')
})

test('Missing Node.js version requirement versus missing LICENSE results in no match', () => {
  const incoming = {
    problem: 'Missing Nvmrc Or Engines',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'missing-nvmrc-or-engines',
  }
  const existing = {
    id: 301,
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.deepEqual(results, [], 'Missing Node.js version requirement must not match missing LICENSE')
})

test('Missing test script versus missing LICENSE results in no match', () => {
  const incoming = {
    problem: 'Missing Test Script',
    error: 'No test script specified in package.json.',
    ruleId: 'missing-test-script',
  }
  const existing = {
    id: 301,
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.deepEqual(results, [], 'Missing test script must not match missing LICENSE')
})

test('Same missing LICENSE issue is classified as likely duplicate', () => {
  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    suggestedFix: 'Add a LICENSE file to the repository root.',
    ruleId: 'missing-license',
  }
  const existing = {
    id: 304,
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    suggestedFix: 'Add a LICENSE file to the repository root.',
    ruleId: 'missing-license',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.equal(results.length, 1)
  assert.equal(results[0].bug.id, 304)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
  const { likelyDuplicates, relatedIssues } = groupSimilarBugs(results)
  assert.equal(likelyDuplicates.length, 1)
  assert.equal(relatedIssues.length, 0)
})

test('Same missing test-script issue is classified as likely duplicate', () => {
  const incoming = {
    problem: 'Missing Test Script',
    error: 'No test script specified in package.json.',
    suggestedFix: 'Add a "test" script to package.json.',
    ruleId: 'missing-test-script',
  }
  const existing = {
    id: 305,
    problem: 'Missing Test Script',
    error: 'Project does not specify a test script in package.json.',
    suggestedFix: 'Add a "test" script to package.json.',
    ruleId: 'missing-test-script',
  }
  const results = findSimilarBugs({ ...incoming, bugs: [existing] })
  assert.equal(results.length, 1)
  assert.equal(results[0].bug.id, 305)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
})

test('Legacy Bug Vault records without rule IDs are matched or excluded based on semantic domain', () => {
  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const legacyLicense = {
    id: 306,
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    solution: 'Add MIT License to root.',
  }
  const legacyUnrelated = {
    id: 307,
    problem: 'Missing Test Script',
    error: 'No test script specified in package.json.',
    solution: 'Add npm test script.',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs: [legacyLicense, legacyUnrelated],
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].bug.id, 306)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
})

test('Multiple results: unrelated entries are excluded while genuine matches remain', () => {
  const bugs = [
    {
      id: 401,
      problem: 'Missing Nvmrc Or Engines',
      error: 'The project does not specify a Node.js version requirement.',
      ruleId: 'missing-nvmrc-or-engines',
    },
    {
      id: 402,
      problem: 'Environment example file is missing',
      error: '.env.example is missing; add one if the project needs environment variables.',
      ruleId: 'environment-example',
    },
    {
      id: 403,
      problem: 'Missing Test Script',
      error: 'No test script specified in package.json.',
      ruleId: 'missing-test-script',
    },
    {
      id: 404,
      problem: 'Missing License',
      error: 'Repository is missing a LICENSE file.',
      ruleId: 'missing-license',
    },
  ]

  const incoming = {
    problem: 'Missing License',
    error: 'Repository is missing a LICENSE file.',
    suggestedFix: 'Add a LICENSE file to the repository root.',
    ruleId: 'missing-license',
  }

  const results = findSimilarBugs({
    ...incoming,
    bugs,
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].bug.id, 404)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
})

test('groupSimilarBugs separates matches and handles empty groups correctly', () => {
  const matchStrong = { bug: { id: 1 }, matchLevel: 'strong' }
  const matchRelated = { bug: { id: 2 }, matchLevel: 'related' }

  // Both groups present
  const both = groupSimilarBugs([matchStrong, matchRelated])
  assert.equal(both.likelyDuplicates.length, 1)
  assert.equal(both.relatedIssues.length, 1)

  // Only strong
  const onlyStrong = groupSimilarBugs([matchStrong])
  assert.equal(onlyStrong.likelyDuplicates.length, 1)
  assert.equal(onlyStrong.relatedIssues.length, 0)

  // Only related
  const onlyRelated = groupSimilarBugs([matchRelated])
  assert.equal(onlyRelated.likelyDuplicates.length, 0)
  assert.equal(onlyRelated.relatedIssues.length, 1)

  // No matches
  const empty = groupSimilarBugs([])
  assert.equal(empty.likelyDuplicates.length, 0)
  assert.equal(empty.relatedIssues.length, 0)

  // Invalid input
  const invalid = groupSimilarBugs(null)
  assert.equal(invalid.likelyDuplicates.length, 0)
  assert.equal(invalid.relatedIssues.length, 0)
})

test('Missing Node.js version declaration versus runtime incompatibility remains a related issue', () => {
  const incoming = {
    problem: 'Node.js version requirement is missing',
    error: 'The project does not specify a Node.js version requirement.',
    suggestedFix: 'Add an engines.node field to package.json.',
    ruleId: 'node-engine',
  }
  const runtimeIncompatibility = {
    id: 501,
    problem: 'Node version mismatch',
    error: 'The engine "node" is incompatible with this module.',
    suggestedFix: 'Set engines.node in package.json.',
    verifiedSolution: 'Use Node.js 22 and run npm install again.',
  }
  const results = findSimilarBugs({
    ...incoming,
    bugs: [runtimeIncompatibility],
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].matchLevel, 'related', 'Runtime incompatibility must not be marked as a duplicate')
  assert.equal(results[0].badgeLabel, 'Related issue')
  assert.match(results[0].matchReason, /incompatibility|differs|differ/i)
})

test('Missing CI workflow versus missing test script must not match', () => {
  const incoming = {
    problem: 'Continuous Integration Workflow',
    error: 'No CI workflow configuration found in .github/workflows.',
    ruleId: 'missing-ci-config',
    suggestedFix: 'name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test',
  }
  const testScriptBug = {
    id: 502,
    problem: 'Test Script Configuration',
    error: 'Test script is missing in package.json.',
    ruleId: 'missing-test-script',
    suggestedFix: '"scripts": {\n  "test": "node --test"\n}',
  }
  const results = findSimilarBugs({
    ...incoming,
    bugs: [testScriptBug],
  })
  assert.deepEqual(results, [], 'Missing CI workflow must not match missing test script')
})

test('Missing LICENSE versus missing environment example must not match', () => {
  const incoming = {
    problem: 'Repository License',
    error: 'Repository is missing a LICENSE file.',
    ruleId: 'missing-license',
  }
  const envExampleBug = {
    id: 503,
    problem: '.env.example Presence',
    error: '.env.example is missing; add one if the project needs environment variables.',
    ruleId: 'environment-example',
  }
  const results = findSimilarBugs({
    ...incoming,
    bugs: [envExampleBug],
  })
  assert.deepEqual(results, [], 'Missing LICENSE must not match missing .env.example')
})

test('Same diagnostic rule with matching evidence is classified as likely duplicate', () => {
  const incoming = {
    problem: 'Node.js Engine Requirement',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'node-engine',
  }
  const matchingBug = {
    id: 504,
    problem: 'Node.js Engine Requirement',
    error: 'The project does not specify a Node.js version requirement.',
    ruleId: 'node-engine',
  }
  const results = findSimilarBugs({
    ...incoming,
    bugs: [matchingBug],
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].matchLevel, 'strong')
  assert.equal(results[0].badgeLabel, 'Likely duplicate')
  assert.match(results[0].matchReason, /node-engine|error message/i)
})

test('Similar suggested fixes but different underlying issues must not be duplicates', () => {
  const incoming = {
    problem: 'Node.js version requirement is missing',
    error: 'The project does not specify a Node.js version requirement.',
    suggestedFix: 'Add an engines.node field to package.json.',
    ruleId: 'node-engine',
  }
  const differentUnderlyingBug = {
    id: 505,
    problem: 'Package install failed',
    error: 'npm ERR! code ENOTEMPTY during installation of dependencies',
    suggestedFix: 'Add an engines.node field to package.json.',
  }
  const results = findSimilarBugs({
    ...incoming,
    bugs: [differentUnderlyingBug],
  })
  if (results.length > 0) {
    assert.notEqual(results[0].matchLevel, 'strong', 'Must not be classified as duplicate purely due to similar fix')
    assert.equal(results[0].badgeLabel, 'Related issue')
  }
})

test('No relevant matches results in an empty list and a hidden similarity panel', () => {
  const incoming = {
    problem: 'Continuous Integration Workflow',
    error: 'No CI workflow configuration found in .github/workflows.',
    ruleId: 'missing-ci-config',
  }
  const savedUnrelated = [
    {
      id: 601,
      problem: 'Repository is missing a LICENSE file.',
      ruleId: 'missing-license',
    },
    {
      id: 602,
      problem: 'Environment example file is missing',
      ruleId: 'environment-example',
    },
    {
      id: 603,
      problem: 'Test script is missing in package.json.',
      ruleId: 'missing-test-script',
    },
  ]
  const results = findSimilarBugs({
    ...incoming,
    bugs: savedUnrelated,
  })
  assert.deepEqual(results, [])

  // Verify group breakdown has zero items in both groups (hiding similarity panel)
  const { likelyDuplicates, relatedIssues } = groupSimilarBugs(results)
  assert.equal(likelyDuplicates.length, 0)
  assert.equal(relatedIssues.length, 0)
  const hasMatches = likelyDuplicates.length > 0 || relatedIssues.length > 0
  assert.equal(hasMatches, false, 'Similarity panel must remain hidden when there are no relevant matches')
})