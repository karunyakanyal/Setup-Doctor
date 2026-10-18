/**
 * Shared language allowlists and categorization utility.
 */

export const PROGRAMMING = [
  'JavaScript',
  'TypeScript',
  'JSX',
  'TSX',
  'Vue',
  'Svelte',
  'Astro',
  'CSS',
  'HTML',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C',
  'C++',
  'C#',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
  'Shell',
]

export const DATA_AND_DOCS = [
  'JSON',
  'YAML',
  'TOML',
  'Markdown',
  'SVG',
]

export const CATEGORIES = {
  PROGRAMMING: 'Languages',
  DATA_AND_DOCS: 'Data and docs',
  OTHER_FILE_TYPES: 'Other file types',
}

const PROGRAMMING_MAP = {
  // JavaScript
  javascript: 'JavaScript',
  js: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  es: 'JavaScript',

  // TypeScript
  typescript: 'TypeScript',
  ts: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  'd.ts': 'TypeScript',

  // JSX
  jsx: 'JSX',

  // TSX
  tsx: 'TSX',

  // Vue
  vue: 'Vue',

  // Svelte
  svelte: 'Svelte',

  // Astro
  astro: 'Astro',

  // CSS and preprocessors
  css: 'CSS',
  scss: 'CSS',
  sass: 'CSS',
  less: 'CSS',
  pcss: 'CSS',
  sss: 'CSS',
  styl: 'CSS',
  stylus: 'CSS',
  wxss: 'CSS',

  // HTML
  html: 'HTML',
  htm: 'HTML',

  // Python
  python: 'Python',
  py: 'Python',

  // Go
  go: 'Go',
  golang: 'Go',

  // Rust
  rust: 'Rust',
  rs: 'Rust',

  // Java
  java: 'Java',

  // C
  c: 'C',
  h: 'C',

  // C++
  'c++': 'C++',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  hxx: 'C++',

  // C#
  'c#': 'C#',
  cs: 'C#',
  csharp: 'C#',

  // Ruby
  ruby: 'Ruby',
  rb: 'Ruby',

  // PHP
  php: 'PHP',

  // Swift
  swift: 'Swift',

  // Kotlin
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  kts: 'Kotlin',

  // Shell
  shell: 'Shell',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
}

const DATA_AND_DOCS_MAP = {
  // JSON
  json: 'JSON',
  json5: 'JSON',
  jsonc: 'JSON',

  // YAML
  yaml: 'YAML',
  yml: 'YAML',

  // TOML
  toml: 'TOML',

  // Markdown
  markdown: 'Markdown',
  md: 'Markdown',
  mdown: 'Markdown',
  mkdn: 'Markdown',
  mdx: 'Markdown',

  // SVG
  svg: 'SVG',
}

/**
 * Classifies a file extension or language name into one of three categories:
 * - PROGRAMMING (returns canonical display name from PROGRAMMING)
 * - DATA_AND_DOCS (returns canonical display name from DATA_AND_DOCS)
 * - OTHER_FILE_TYPES (never title-cased into a language name)
 */
export function classifyFileType(rawLang) {
  if (!rawLang) {
    return { category: 'OTHER_FILE_TYPES', label: 'Other', isProgramming: false }
  }

  const trimmed = String(rawLang).trim()
  const lower = trimmed.toLowerCase()

  // 1. Check PROGRAMMING allowlist
  if (PROGRAMMING_MAP[lower]) {
    return {
      category: 'PROGRAMMING',
      label: PROGRAMMING_MAP[lower],
      isProgramming: true,
    }
  }
  const canonicalProg = PROGRAMMING.find((p) => p.toLowerCase() === lower)
  if (canonicalProg) {
    return {
      category: 'PROGRAMMING',
      label: canonicalProg,
      isProgramming: true,
    }
  }

  // 2. Check DATA_AND_DOCS allowlist
  if (DATA_AND_DOCS_MAP[lower]) {
    return {
      category: 'DATA_AND_DOCS',
      label: DATA_AND_DOCS_MAP[lower],
      isProgramming: false,
    }
  }
  const canonicalData = DATA_AND_DOCS.find((d) => d.toLowerCase() === lower)
  if (canonicalData) {
    return {
      category: 'DATA_AND_DOCS',
      label: canonicalData,
      isProgramming: false,
    }
  }

  // 3. Anything else is OTHER_FILE_TYPES, never a language.
  // Never title-case an unknown extension into a language name!
  let label
  const isPath = (trimmed.includes('/') || trimmed.includes('\\')) && lower !== 'config/other'

  if (isPath || lower === 'other' || lower === 'gitignore' || lower === 'txt') {
    label = 'Other'
  } else if (lower === 'binary') {
    label = 'Binary'
  } else if (lower === 'config/other') {
    label = 'config/other'
  } else {
    // Keep raw extension/name without title-casing
    label = trimmed
  }

  return {
    category: 'OTHER_FILE_TYPES',
    label,
    isProgramming: false,
  }
}

/**
 * Groups byLanguage entries into 3 categorized lists:
 * - languages: PROGRAMMING entries (count > 0)
 * - dataAndDocs: DATA_AND_DOCS entries (count > 0)
 * - otherFileTypes: OTHER_FILE_TYPES entries (count > 0)
 */
export function groupLanguages(byLanguage = {}) {
  const programmingMap = new Map()
  const dataAndDocsMap = new Map()
  const otherMap = new Map()

  for (const [rawKey, rawCount] of Object.entries(byLanguage)) {
    const count = Number(rawCount) || 0
    if (count <= 0) continue

    const { category, label } = classifyFileType(rawKey)
    if (category === 'PROGRAMMING') {
      programmingMap.set(label, (programmingMap.get(label) || 0) + count)
    } else if (category === 'DATA_AND_DOCS') {
      dataAndDocsMap.set(label, (dataAndDocsMap.get(label) || 0) + count)
    } else {
      otherMap.set(label, (otherMap.get(label) || 0) + count)
    }
  }

  const languages = Array.from(programmingMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const dataAndDocs = Array.from(dataAndDocsMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const otherFileTypes = Array.from(otherMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  return {
    languages,
    dataAndDocs,
    otherFileTypes,
    programmingCount: languages.length,
  }
}
