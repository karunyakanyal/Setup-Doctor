const CATEGORY_RULES = [
  {
    category: 'Environment',
    priority: 8,
    patterns: [
      /\b(?:node(?:\.js)?|python|java|jdk|jre)\b.{0,50}\b(?:version|v\d+(?:\.\d+)*|requirement|mismatch|incompatib\w*|unsupported)\b/i,
      /\b(?:version|requirement|mismatch|incompatib\w*|unsupported)\b.{0,50}\b(?:node(?:\.js)?|python|java|jdk|jre)\b/i,
      /\b(?:runtime|platform|operating system)\b.{0,40}\b(?:version|requirement|mismatch|incompatib\w*|unsupported)\b/i,
    ],
    score: 25,
  },
  {
    category: 'Dependencies',
    priority: 7,
    patterns: [
      /\b(?:dependency|dependencies|package)\s+(?:install(?:ation)?|conflict|mismatch|resolution|resolv\w*|missing|not found)\b/i,
      /\b(?:npm|pnpm|yarn|pip|poetry|composer)\s+(?:install|add|ci)\b/i,
      /\b(?:peer )?dependencies?\b/i,
      /\b(?:module|package)\s+not found\b|\bcannot find module\b/i,
    ],
    score: 22,
  },
  {
    category: 'Configuration',
    priority: 6,
    patterns: [
      /\.env(?:\.[a-z0-9_-]+)?\b/i,
      /\benvironment variables?\b/i,
      /\b(?:config(?:uration)?|settings?)\b.{0,40}\b(?:missing|invalid|incorrect|wrong|not set|unset|required|example)\b/i,
      /\b(?:missing|required|undefined|unset)\s+(?:environment )?variables?\b/i,
    ],
    score: 24,
  },
  {
    category: 'Git',
    priority: 5,
    patterns: [
      /\bgit\s+(?:push|pull|merge|rebase|checkout|switch|branch|commit|clone|fetch|reset|cherry-pick)\b/i,
      /\b(?:merge conflict|push rejected|branch conflict|git branch)\b/i,
    ],
    score: 23,
  },
  {
    category: 'Build',
    priority: 4,
    patterns: [
      /\b(?:npm|pnpm|yarn)\s+run\s+build\b/i,
      /\bproduction build\b/i,
      /\b(?:build|compilation|compile|bundl\w*)\b.{0,40}\b(?:fail\w*|error|issue|broken|breaks?)\b/i,
      /\b(?:fail\w*|error|issue|broken|breaks?)\b.{0,40}\b(?:build|compilation|compile|bundl\w*)\b/i,
    ],
    score: 21,
  },
  {
    category: 'Runtime',
    priority: 3,
    patterns: [
      /\b(?:runtime error|at runtime|crash\w*|uncaught exception|unhandled exception|segmentation fault|stack overflow)\b/i,
      /\bapplication\b.{0,35}\b(?:crash\w*|exception|fails? at runtime)\b/i,
    ],
    score: 20,
  },
  {
    category: 'Frontend',
    priority: 2,
    patterns: [
      /\b(?:react|vue|angular|svelte|css|html|browser|frontend|front-end|ui|dom|component|layout)\b/i,
    ],
    score: 10,
  },
  {
    category: 'Backend',
    priority: 1,
    patterns: [
      /\b(?:express|api|server|endpoint|backend|back-end|http handler|route)\b/i,
    ],
    score: 10,
  },
]

export function categorizeBug({
  problem = '',
  error = '',
  cause = '',
  solution = '',
} = {}) {
  const combinedText = [problem, error, cause, solution]
    .filter((value) => value != null)
    .map((value) => String(value))
    .join(' ')

  let bestMatch = null

  for (const rule of CATEGORY_RULES) {
    const matches = rule.patterns.some((pattern) =>
      pattern.test(combinedText),
    )

    if (
      matches &&
      (!bestMatch ||
        rule.score > bestMatch.score ||
        (rule.score === bestMatch.score &&
          rule.priority > bestMatch.priority))
    ) {
      bestMatch = rule
    }
  }

  return bestMatch?.category || 'Other'
}