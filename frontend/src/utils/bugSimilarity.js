const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'does',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'project',
  'the',
  'this',
  'to',
  'was',
  'with',
])

function tokenize(text) {
  if (typeof text !== 'string') {
    return []
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 1 &&
        !STOP_WORDS.has(word),
    )
}

function createTokenSet(text) {
  return new Set(tokenize(text))
}

/*
 * Compare a new problem with one saved Bug Vault entry.
 *
 * The score is based on shared meaningful keywords.
 * A higher score means the two problems are more similar.
 */
function calculateSimilarity(newText, savedText) {
  const newTokens = createTokenSet(newText)
  const savedTokens = createTokenSet(savedText)

  if (!newTokens.size || !savedTokens.size) {
    return 0
  }

  let sharedTokens = 0

  newTokens.forEach((token) => {
    if (savedTokens.has(token)) {
      sharedTokens += 1
    }
  })

  const smallerSetSize = Math.min(
    newTokens.size,
    savedTokens.size,
  )

  return sharedTokens / smallerSetSize
}

/*
 * Find previously saved bugs that are meaningfully
 * similar to the current problem.
 */
export function findSimilarBugs({
  problem = '',
  error = '',
  cause = '',
  bugs = [],
  limit = 3,
}) {
  const currentText = [
    problem,
    error,
    cause,
  ]
    .filter(Boolean)
    .join(' ')

  if (!currentText.trim() || !Array.isArray(bugs)) {
    return []
  }

  return bugs
    .map((bug) => ({
      bug,
      // Extra error/cause details must not dilute a strong problem match.
      similarity: Math.max(
        calculateSimilarity(problem, bug.problem),
        calculateSimilarity(
          currentText,
          [bug.problem, bug.error, bug.cause].filter(Boolean).join(' '),
        ),
      ),
    }))
    .filter(
      (item) => item.similarity >= 0.4,
    )
    .sort(
      (a, b) => b.similarity - a.similarity,
    )
    .slice(0, limit)
}
