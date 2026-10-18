import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROGRAMMING,
  DATA_AND_DOCS,
  CATEGORIES,
  classifyFileType,
  groupLanguages,
} from './languages.js'

test('languages: exports PROGRAMMING, DATA_AND_DOCS, and CATEGORIES', () => {
  assert.ok(Array.isArray(PROGRAMMING))
  assert.ok(Array.isArray(DATA_AND_DOCS))
  assert.equal(CATEGORIES.PROGRAMMING, 'Languages')
  assert.equal(CATEGORIES.DATA_AND_DOCS, 'Data and docs')
  assert.equal(CATEGORIES.OTHER_FILE_TYPES, 'Other file types')

  // Verify all 21 programming languages are present in PROGRAMMING allowlist
  const expectedProg = [
    'JavaScript', 'TypeScript', 'JSX', 'TSX', 'Vue', 'Svelte', 'Astro',
    'CSS', 'HTML', 'Python', 'Go', 'Rust', 'Java', 'C', 'C++', 'C#',
    'Ruby', 'PHP', 'Swift', 'Kotlin', 'Shell',
  ]
  for (const lang of expectedProg) {
    assert.ok(PROGRAMMING.includes(lang), `PROGRAMMING includes ${lang}`)
  }

  // Verify all 5 data & doc types are present in DATA_AND_DOCS allowlist
  const expectedData = ['JSON', 'YAML', 'TOML', 'Markdown', 'SVG']
  for (const doc of expectedData) {
    assert.ok(DATA_AND_DOCS.includes(doc), `DATA_AND_DOCS includes ${doc}`)
  }
})

test('classifyFileType: maps programming languages and variants to canonical display names', () => {
  // JavaScript variants
  assert.deepEqual(classifyFileType('javascript'), { category: 'PROGRAMMING', label: 'JavaScript', isProgramming: true })
  assert.deepEqual(classifyFileType('js'), { category: 'PROGRAMMING', label: 'JavaScript', isProgramming: true })
  assert.deepEqual(classifyFileType('mjs'), { category: 'PROGRAMMING', label: 'JavaScript', isProgramming: true })
  assert.deepEqual(classifyFileType('cjs'), { category: 'PROGRAMMING', label: 'JavaScript', isProgramming: true })
  assert.deepEqual(classifyFileType('es'), { category: 'PROGRAMMING', label: 'JavaScript', isProgramming: true })

  // TypeScript variants
  assert.deepEqual(classifyFileType('typescript'), { category: 'PROGRAMMING', label: 'TypeScript', isProgramming: true })
  assert.deepEqual(classifyFileType('ts'), { category: 'PROGRAMMING', label: 'TypeScript', isProgramming: true })
  assert.deepEqual(classifyFileType('mts'), { category: 'PROGRAMMING', label: 'TypeScript', isProgramming: true })
  assert.deepEqual(classifyFileType('cts'), { category: 'PROGRAMMING', label: 'TypeScript', isProgramming: true })

  // JSX / TSX
  assert.deepEqual(classifyFileType('jsx'), { category: 'PROGRAMMING', label: 'JSX', isProgramming: true })
  assert.deepEqual(classifyFileType('tsx'), { category: 'PROGRAMMING', label: 'TSX', isProgramming: true })

  // Frameworks
  assert.deepEqual(classifyFileType('vue'), { category: 'PROGRAMMING', label: 'Vue', isProgramming: true })
  assert.deepEqual(classifyFileType('svelte'), { category: 'PROGRAMMING', label: 'Svelte', isProgramming: true })
  assert.deepEqual(classifyFileType('astro'), { category: 'PROGRAMMING', label: 'Astro', isProgramming: true })

  // CSS and preprocessors
  assert.deepEqual(classifyFileType('css'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('pcss'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('sss'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('styl'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('wxss'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('scss'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })
  assert.deepEqual(classifyFileType('less'), { category: 'PROGRAMMING', label: 'CSS', isProgramming: true })

  // Other programming languages
  assert.deepEqual(classifyFileType('html'), { category: 'PROGRAMMING', label: 'HTML', isProgramming: true })
  assert.deepEqual(classifyFileType('python'), { category: 'PROGRAMMING', label: 'Python', isProgramming: true })
  assert.deepEqual(classifyFileType('py'), { category: 'PROGRAMMING', label: 'Python', isProgramming: true })
  assert.deepEqual(classifyFileType('go'), { category: 'PROGRAMMING', label: 'Go', isProgramming: true })
  assert.deepEqual(classifyFileType('rust'), { category: 'PROGRAMMING', label: 'Rust', isProgramming: true })
  assert.deepEqual(classifyFileType('java'), { category: 'PROGRAMMING', label: 'Java', isProgramming: true })
  assert.deepEqual(classifyFileType('c'), { category: 'PROGRAMMING', label: 'C', isProgramming: true })
  assert.deepEqual(classifyFileType('cpp'), { category: 'PROGRAMMING', label: 'C++', isProgramming: true })
  assert.deepEqual(classifyFileType('c++'), { category: 'PROGRAMMING', label: 'C++', isProgramming: true })
  assert.deepEqual(classifyFileType('cs'), { category: 'PROGRAMMING', label: 'C#', isProgramming: true })
  assert.deepEqual(classifyFileType('ruby'), { category: 'PROGRAMMING', label: 'Ruby', isProgramming: true })
  assert.deepEqual(classifyFileType('php'), { category: 'PROGRAMMING', label: 'PHP', isProgramming: true })
  assert.deepEqual(classifyFileType('swift'), { category: 'PROGRAMMING', label: 'Swift', isProgramming: true })
  assert.deepEqual(classifyFileType('kotlin'), { category: 'PROGRAMMING', label: 'Kotlin', isProgramming: true })
  assert.deepEqual(classifyFileType('shell'), { category: 'PROGRAMMING', label: 'Shell', isProgramming: true })
  assert.deepEqual(classifyFileType('sh'), { category: 'PROGRAMMING', label: 'Shell', isProgramming: true })
  assert.deepEqual(classifyFileType('bash'), { category: 'PROGRAMMING', label: 'Shell', isProgramming: true })
})

test('classifyFileType: maps data and docs to canonical display names', () => {
  assert.deepEqual(classifyFileType('json'), { category: 'DATA_AND_DOCS', label: 'JSON', isProgramming: false })
  assert.deepEqual(classifyFileType('json5'), { category: 'DATA_AND_DOCS', label: 'JSON', isProgramming: false })
  assert.deepEqual(classifyFileType('yaml'), { category: 'DATA_AND_DOCS', label: 'YAML', isProgramming: false })
  assert.deepEqual(classifyFileType('yml'), { category: 'DATA_AND_DOCS', label: 'YAML', isProgramming: false })
  assert.deepEqual(classifyFileType('toml'), { category: 'DATA_AND_DOCS', label: 'TOML', isProgramming: false })
  assert.deepEqual(classifyFileType('markdown'), { category: 'DATA_AND_DOCS', label: 'Markdown', isProgramming: false })
  assert.deepEqual(classifyFileType('md'), { category: 'DATA_AND_DOCS', label: 'Markdown', isProgramming: false })
  assert.deepEqual(classifyFileType('svg'), { category: 'DATA_AND_DOCS', label: 'SVG', isProgramming: false })
})

test('classifyFileType: never title-cases unknown extensions into language names', () => {
  const unknowns = ['snap', 'map', 'lock', 'patch', 'crt', 'dot', 'notjs', 'custom', 'unknown', 'pug']
  for (const ext of unknowns) {
    const res = classifyFileType(ext)
    assert.equal(res.category, 'OTHER_FILE_TYPES')
    assert.equal(res.isProgramming, false)
    assert.equal(res.label, ext, `label must remain "${ext}" and never be title-cased`)
    assert.notEqual(res.label, ext.charAt(0).toUpperCase() + ext.slice(1))
  }
})

test('groupLanguages: vite shape gives 9 languages and never counts snap, map, lock, patch, crt, dot, notjs, custom, unknown', () => {
  const viteByLanguage = {
    'config/other': 59,
    yaml: 23,
    markdown: 84,
    json5: 1,
    typescript: 592,
    vue: 26,
    css: 250,
    javascript: 977,
    svg: 113,
    binary: 89,
    json: 392,
    toml: 1,
    html: 160,
    tsx: 17,
    jsx: 9,
    svelte: 6,
    snap: 7,
    lock: 2,
    txt: 9,
    map: 5,
    patch: 3,
    unknown: 1,
    custom: 1,
    pcss: 1,
    sss: 3,
    styl: 6,
    wxss: 1,
    crt: 1,
    dot: 1,
    notjs: 1,
    astro: 1,
    es: 1,
    pug: 1,
    sh: 5,
  }

  const result = groupLanguages(viteByLanguage)

  // 1. Languages card counts only PROGRAMMING entries with count > 0: exactly 10 (Shell included)
  assert.equal(result.programmingCount, 10, 'Vite shape must have exactly 10 programming languages (Shell included)')
  assert.equal(result.languages.length, 10)

  const languageLabels = result.languages.map((l) => l.label)
  assert.deepEqual(
    languageLabels.sort(),
    ['Astro', 'CSS', 'HTML', 'JSX', 'JavaScript', 'Shell', 'Svelte', 'TSX', 'TypeScript', 'Vue'].sort(),
  )

  // Merged counts
  const js = result.languages.find((l) => l.label === 'JavaScript')
  assert.equal(js.count, 978) // 977 + 1 (es)
  const ts = result.languages.find((l) => l.label === 'TypeScript')
  assert.equal(ts.count, 592)
  const css = result.languages.find((l) => l.label === 'CSS')
  assert.equal(css.count, 261) // 250 + 1 (pcss) + 3 (sss) + 6 (styl) + 1 (wxss)

  // 2. Data and docs: JSON, SVG, Markdown, YAML, TOML
  assert.equal(result.dataAndDocs.length, 5)
  const dataLabels = result.dataAndDocs.map((d) => d.label)
  assert.deepEqual(dataLabels.sort(), ['JSON', 'Markdown', 'SVG', 'TOML', 'YAML'].sort())
  const json = result.dataAndDocs.find((d) => d.label === 'JSON')
  assert.equal(json.count, 393) // 392 + 1 (json5)

  // 3. Other file types: none of snap, map, lock, patch, crt, dot, notjs, custom, unknown are languages
  const uncounted = ['snap', 'map', 'lock', 'patch', 'crt', 'dot', 'notjs', 'custom', 'unknown']
  for (const name of uncounted) {
    assert.equal(languageLabels.includes(name), false, `${name} must not be in languages`)
    assert.equal(
      languageLabels.includes(name.charAt(0).toUpperCase() + name.slice(1)),
      false,
      `Title-cased ${name} must not be in languages`,
    )
  }

  // They exist in otherFileTypes
  const otherLabels = result.otherFileTypes.map((o) => o.label)
  for (const name of uncounted) {
    assert.ok(otherLabels.includes(name), `${name} must be in otherFileTypes`)
  }
})

test('groupLanguages: Skinveda shape gives 5 languages and never counts snap, map, lock, patch, crt, dot, notjs, custom, unknown', () => {
  const skinvedaByLanguage = {
    typescript: 95,
    tsx: 32,
    javascript: 10,
    jsx: 3,
    css: 2,
    json: 25,
    svg: 15,
    markdown: 8,
    snap: 6,
    map: 3,
    lock: 1,
    patch: 1,
    crt: 1,
    dot: 1,
    notjs: 1,
    custom: 1,
    unknown: 1,
    binary: 5,
    other: 2,
  }

  const result = groupLanguages(skinvedaByLanguage)

  // Skinveda shape gives exactly 5 languages
  assert.equal(result.programmingCount, 5, 'Skinveda shape must have exactly 5 programming languages')
  assert.equal(result.languages.length, 5)

  const languageLabels = result.languages.map((l) => l.label)
  assert.deepEqual(
    languageLabels.sort(),
    ['CSS', 'JSX', 'JavaScript', 'TSX', 'TypeScript'].sort(),
  )

  // Data and docs has JSON, SVG, Markdown
  assert.equal(result.dataAndDocs.length, 3)

  // None of the non-languages are in languages
  const uncounted = ['snap', 'map', 'lock', 'patch', 'crt', 'dot', 'notjs', 'custom', 'unknown']
  for (const name of uncounted) {
    assert.equal(languageLabels.includes(name), false)
    assert.equal(languageLabels.includes(name.charAt(0).toUpperCase() + name.slice(1)), false)
  }
})
