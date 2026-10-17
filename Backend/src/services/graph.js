const path = require('path')

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.html'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.json']
const MAX_NODES = 3000

// Common Node.js built-in modules
const NODE_BUILTINS = new Set([
	'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
	'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
	'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
	'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
	'querystring', 'readline', 'repl', 'stream', 'stream/promises', 'stream/web',
	'string_decoder', 'test', 'timers', 'timers/promises', 'tls', 'trace_events',
	'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

function isNodeBuiltin(name) {
	if (!name) return false
	if (name.startsWith('node:')) return true
	return NODE_BUILTINS.has(name)
}

function normalizeExternalPackageName(specifier) {
	if (!specifier) return ''
	let clean = specifier.trim()
	if (clean.startsWith('node:')) {
		return clean
	}
	if (clean.startsWith('@')) {
		const parts = clean.split('/')
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`
		}
		return clean
	}
	return clean.split('/')[0]
}

const CONFIG_TOOLS = ['eslint', 'vite', 'tailwind', 'postcss', 'babel', 'jest', 'vitest', 'prettier']

const BIN_ALIASES = {
	tsc: 'typescript',
	ng: '@angular/cli',
	playwright: '@playwright/test',
}

function isConfigFile(filePath) {
	if (!filePath) return false
	const base = path.posix.basename(filePath).toLowerCase()
	// *.config.* (e.g. vite.config.js, tailwind.config.ts)
	if (base.includes('.config.')) return true
	// rc or dotfile configs for eslint, vite, tailwind, postcss, babel, jest, vitest, prettier
	for (const tool of CONFIG_TOOLS) {
		if (
			base.startsWith(`.${tool}rc`) ||
			base.startsWith(`${tool}rc`) ||
			base.startsWith(`.${tool}.`) ||
			base.startsWith(`${tool}.`) ||
			base === `.${tool}` ||
			base === tool
		) {
			return true
		}
	}
	return false
}

function isTestFile(filePath) {
	if (!filePath) return false
	const clean = filePath.replace(/\\/g, '/')
	const base = path.posix.basename(clean).toLowerCase()
	// *.test.* and *.spec.*
	if (base.includes('.test.') || base.includes('.spec.')) return true
	// folder in __tests__/ or tests/
	const parts = clean.split('/')
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i].toLowerCase()
		if (part === '__tests__' || part === 'tests') {
			return true
		}
	}
	return false
}

function isTestSetupFile(filePath) {
	if (!filePath) return false
	const base = path.posix.basename(filePath).toLowerCase()
	return (
		base.includes('.setup.') ||
		base.startsWith('setup-tests.') ||
		base.startsWith('setuptests.') ||
		base.startsWith('test-setup.') ||
		base.startsWith('test.setup.') ||
		base === 'setup.js' ||
		base === 'setup.ts'
	)
}

function isDeclarationFile(filePath) {
	if (!filePath) return false
	const lower = filePath.toLowerCase()
	return lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts')
}

function isToolEntryCandidate(filePath) {
	if (!filePath) return false
	const clean = filePath.replace(/\\/g, '/')
	const parts = clean.split('/')
	return parts.includes('scripts') || parts.includes('bin')
}

function isNonProductionFile(filePath) {
	if (!filePath) return false
	const clean = filePath.replace(/\\/g, '/')
	const parts = clean.split('/')
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i].toLowerCase()
		if (
			/^__.*__$/.test(part) ||
			part.startsWith('template-') ||
			part === 'templates' ||
			part === 'misc' ||
			part === 'playground' ||
			part === 'examples' ||
			part === 'example' ||
			part === 'test' ||
			part === 'tests' ||
			part === 'fixtures' ||
			part === '__fixtures__' ||
			part === 'e2e' ||
			part === 'docs'
		) {
			return true
		}
	}
	const base = path.posix.basename(clean).toLowerCase()
	if (base.includes('.spec.') || base.includes('.test.')) {
		return true
	}
	return false
}

/**
 * Packages ignored in declaredButUnused:
 * - @types/*: TypeScript type declaration packages stay ignored unconditionally.
 * Tooling packages (typescript, vite, vitest, jest, eslint, prettier, etc.)
 * are only ignored if referenced in package.json scripts or config files.
 */
function isIgnoredToolingPackage(pkgName) {
	if (!pkgName) return false
	return pkgName.startsWith('@types/')
}

function isIgnoredDependency(depName, versionStr, localPackageNames) {
	if (!depName) return true
	if (localPackageNames && localPackageNames.has(depName)) return true
	if (typeof versionStr === 'string') {
		const v = versionStr.trim()
		if (
			v.startsWith('workspace:') ||
			v.startsWith('link:') ||
			v.startsWith('file:') ||
			v.startsWith('portal:')
		) {
			return true
		}
	}
	return false
}

const EXTENSION_LANGUAGE_MAP = {
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	vue: 'vue',
	json: 'json',
	md: 'markdown',
	markdown: 'markdown',
	html: 'html',
	htm: 'html',
	css: 'css',
	scss: 'css',
	sass: 'css',
	less: 'css',
	py: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	hpp: 'cpp',
	cc: 'cpp',
	cxx: 'cpp',
	rb: 'ruby',
	php: 'php',
	sh: 'shell',
	bash: 'shell',
	yml: 'yaml',
	yaml: 'yaml',
	sql: 'sql',
	xml: 'xml',
	svg: 'svg',
	graphql: 'graphql',
	gql: 'graphql',
}

function detectLanguage(filePath) {
	if (!filePath || typeof filePath !== 'string') return 'config/other'
	const clean = filePath.replace(/\\/g, '/').trim()
	const base = path.posix.basename(clean).toLowerCase()

	// Extensionless files and dotfiles (.gitignore, _headers, license, etc.) map to "config/other"
	if (base.startsWith('.') || !base.includes('.')) {
		return 'config/other'
	}

	const ext = path.posix.extname(base).slice(1).toLowerCase()
	if (!ext) {
		return 'config/other'
	}

	return EXTENSION_LANGUAGE_MAP[ext] || ext
}



const NPM_PACKAGE_REGEX = /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+(\/[^\s'"`\\()]*)?$/i

function isValidSpecifier(specifier) {
	if (!specifier || typeof specifier !== 'string') return false
	const clean = specifier.trim()
	if (!clean) return false
	// Drop anything with spaces, newlines, quotes, parentheses or backslashes
	if (/[\s\r\n'"\\()]/.test(clean)) return false
	// Drop import.meta, virtual: ids, pnpapi, and ids starting with \0
	if (
		clean === 'import.meta' ||
		clean.startsWith('import.meta.') ||
		clean.startsWith('virtual:') ||
		clean === 'pnpapi' ||
		clean.startsWith('pnpapi/') ||
		clean.startsWith('\0') ||
		clean.startsWith('\\0')
	) {
		return false
	}
	// Accept relative / absolute paths (including '.' and '..')
	if (clean === '.' || clean === '..' || clean.startsWith('./') || clean.startsWith('../') || clean.startsWith('/')) {
		return true
	}
	// Accept node: builtins
	if (clean.startsWith('node:') || isNodeBuiltin(clean)) {
		return true
	}
	// Accept subpath imports (#...)
	if (clean.startsWith('#')) {
		return true
	}
	// Accept aliases (~... or @... or @/...)
	if (clean.startsWith('~') || clean.startsWith('@')) {
		return true
	}
	// Accept npm package names
	if (NPM_PACKAGE_REGEX.test(clean)) {
		return true
	}
	return false
}

function isRelativeSpecifier(spec) {
	if (!spec || typeof spec !== 'string') return false
	const clean = spec.trim()
	return clean === '.' || clean === '..' || clean.startsWith('./') || clean.startsWith('../')
}

function readQuotedString(sourceCode, startIdx) {
	const quote = sourceCode[startIdx]
	let j = startIdx + 1
	const n = sourceCode.length
	let spec = ''
	while (j < n && sourceCode[j] !== quote) {
		if (sourceCode[j] === '\\') {
			const nextChar = sourceCode[j + 1]
			if (nextChar === '0') {
				spec += '\0'
			} else if (nextChar === '\\') {
				spec += '\\'
			} else if (nextChar === 'n') {
				spec += '\n'
			} else if (nextChar === 'r') {
				spec += '\r'
			} else if (nextChar === 't') {
				spec += '\t'
			} else if (nextChar !== undefined) {
				spec += nextChar
			}
			j += 2
		} else {
			spec += sourceCode[j]
			j++
		}
	}
	if (j < n) j++
	return { spec, nextIdx: j }
}

/**
 * Scans JavaScript / TypeScript / Vue source code to extract import and export specifiers.
 * Returns Array<{ specifier: string, typeOnly: boolean }>
 */
function extractImports(sourceCode) {
	const results = []
	if (!sourceCode || typeof sourceCode !== 'string') return results

	let i = 0
	const n = sourceCode.length
	let lastToken = ''

	// Template literal stack tracking interpolation depth
	// elements: { braceDepth: number }
	const templateStack = []

	while (i < n) {
		const ch = sourceCode[i]

		// 1. If currently inside a template literal string (and NOT in an interpolation expression ${...})
		if (templateStack.length > 0 && templateStack[templateStack.length - 1].braceDepth === 0) {
			if (ch === '\\') {
				i += 2 // skip escape
				continue
			}
			if (ch === '`') {
				templateStack.pop()
				i++
				lastToken = '`'
				continue
			}
			if (ch === '$' && sourceCode[i + 1] === '{') {
				templateStack[templateStack.length - 1].braceDepth = 1
				i += 2
				lastToken = '{'
				continue
			}
			i++
			continue
		}

		// 2. Comments (only outside template strings or inside ${...})
		if (ch === '/' && sourceCode[i + 1] === '/') {
			i += 2
			while (i < n && sourceCode[i] !== '\n' && sourceCode[i] !== '\r') i++
			continue
		}
		if (ch === '/' && sourceCode[i + 1] === '*') {
			i += 2
			while (i < n && !(sourceCode[i] === '*' && sourceCode[i + 1] === '/')) i++
			if (i < n) i += 2
			continue
		}

		// 3. Opening a new template literal (when outside template string or inside ${...})
		if (ch === '`') {
			templateStack.push({ braceDepth: 0 })
			i++
			continue
		}

		// If inside an interpolation expression (${...}), track braces
		if (templateStack.length > 0 && templateStack[templateStack.length - 1].braceDepth > 0) {
			if (ch === '{') {
				templateStack[templateStack.length - 1].braceDepth++
				lastToken = '{'
				i++
				continue
			}
			if (ch === '}') {
				templateStack[templateStack.length - 1].braceDepth--
				lastToken = '}'
				i++
				continue
			}
		}

		// 3. String literals (outside template literal strings)
		if (ch === "'" || ch === '"') {
			const quote = ch
			i++
			while (i < n) {
				if (sourceCode[i] === '\\') {
					i += 2
				} else if (sourceCode[i] === quote) {
					i++
					break
				} else {
					i++
				}
			}
			lastToken = quote
			continue
		}

		// 4. Regular expressions vs division
		if (ch === '/') {
			const isRegex =
				/^[=(,;:?[!&|+*~%<>^\n\r{]$/.test(lastToken) ||
				/^(return|case|throw|delete|void|typeof|instanceof|in|of|yield|await)$/.test(lastToken) ||
				lastToken === ''

			if (isRegex) {
				i++
				let inClass = false
				while (i < n) {
					if (sourceCode[i] === '\\') {
						i += 2
					} else if (sourceCode[i] === '[' && !inClass) {
						inClass = true
						i++
					} else if (sourceCode[i] === ']' && inClass) {
						inClass = false
						i++
					} else if (sourceCode[i] === '/' && !inClass) {
						i++
						// Skip regex flags
						while (i < n && /[a-z]/i.test(sourceCode[i])) i++
						break
					} else if (sourceCode[i] === '\n' || sourceCode[i] === '\r') {
						break
					} else {
						i++
					}
				}
				lastToken = 'regex'
				continue
			} else {
				// Division operator
				lastToken = '/'
				i++
				continue
			}
		}

		// 5. Track tokens for regex vs division
		if (/[\s\r\n]/.test(ch)) {
			i++
			continue
		}

		if (/[=(),;:?[!&|+*~%<>^{}[\]]/.test(ch)) {
			lastToken = ch
		}

		// 6. dynamic import('...') or import.meta or static import
		if (
			sourceCode.startsWith('import', i) &&
			(i === 0 || (!/[\w$]/.test(sourceCode[i - 1]) && sourceCode[i - 1] !== '.' && sourceCode[i - 1] !== '?')) &&
			!/[\w$]/.test(sourceCode[i + 6] || '')
		) {
			let j = i + 6
			while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++

			// import.meta -> skip
			if (sourceCode[j] === '.') {
				i += 6
				lastToken = 'import'
				continue
			}

			// dynamic import(...)
			if (sourceCode[j] === '(') {
				j++
				while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++
				// Must be literal string ('...' or "...")
				if (sourceCode[j] === "'" || sourceCode[j] === '"') {
					const { spec, nextIdx } = readQuotedString(sourceCode, j)
					j = nextIdx
					while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++
					// Optional import attributes: , { with: ... }
					if (sourceCode[j] === ',' || sourceCode[j] === ')') {
						if (isValidSpecifier(spec)) {
							results.push({ specifier: spec.trim(), typeOnly: false })
						}
					}
					i = j
					lastToken = ')'
					continue
				} else {
					// Non-literal dynamic import (e.g. import(x), import(`...`)) -> IGNORE
					i = j
					lastToken = '('
					continue
				}
			}

			// Side-effect import: import 'specifier'
			if (sourceCode[j] === "'" || sourceCode[j] === '"') {
				const { spec, nextIdx } = readQuotedString(sourceCode, j)
				if (isValidSpecifier(spec)) {
					results.push({ specifier: spec.trim(), typeOnly: false })
				}
				i = nextIdx
				lastToken = ';'
				continue
			}

			// If not a quote and not a valid identifier / { / *, this is NOT an import statement (e.g. import:, import?:, import=)
			if (!/[a-zA-Z_{$*]/.test(sourceCode[j])) {
				i += 6
				lastToken = 'import'
				continue
			}

			// Static import statement with clause: import ... from 'specifier'
			let isTypeOnly = false
			let clause = ''
			let inBraces = 0
			let hasFrom = false
			let foundSpecifier = null

			// Check if starts with 'type' keyword right after import (excluding 'import type from')
			const afterImport = sourceCode.slice(j, j + 50)
			if (/^type\s+(?!from\s+)[\w${*]/.test(afterImport)) {
				isTypeOnly = true
			}

			while (j < n) {
				const c = sourceCode[j]

				// Skip comments inside import statement
				if (c === '/' && sourceCode[j + 1] === '/') {
					j += 2
					while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
					continue
				}
				if (c === '/' && sourceCode[j + 1] === '*') {
					j += 2
					while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
					if (j < n) j += 2
					continue
				}

				if (c === '{') inBraces++
				if (c === '}') inBraces = Math.max(0, inBraces - 1)

				if (
					inBraces === 0 &&
					sourceCode.startsWith('from', j) &&
					!/[\w$]/.test(sourceCode[j - 1] || '') &&
					!/[\w$]/.test(sourceCode[j + 4] || '')
				) {
					hasFrom = true
					j += 4
					continue
				}

				if (hasFrom && (c === "'" || c === '"')) {
					const { spec, nextIdx } = readQuotedString(sourceCode, j)
					foundSpecifier = spec
					j = nextIdx
					break
				}

				if (c === ';' || (inBraces === 0 && (c === '\n' || c === '\r') && (sourceCode.startsWith('import', j + 1) || sourceCode.startsWith('export', j + 1)))) {
					break
				}

				clause += c
				j++
			}

			if (foundSpecifier) {
				// If not already marked as typeOnly, check if it's import { type A, type B } from '...'
				if (!isTypeOnly && clause.includes('{') && clause.includes('}')) {
					const braceMatch = clause.match(/\{([^}]*)\}/)
					if (braceMatch) {
						const beforeBrace = clause.slice(0, clause.indexOf('{')).replace(/from/g, '').trim()
						if (!beforeBrace) {
							const specifiersInside = braceMatch[1]
								.split(',')
								.map((s) => s.trim())
								.filter(Boolean)
							if (specifiersInside.length > 0 && specifiersInside.every((s) => /^type\s+/.test(s))) {
								isTypeOnly = true
							}
						}
					}
				}

				if (isValidSpecifier(foundSpecifier)) {
					results.push({ specifier: foundSpecifier.trim(), typeOnly: isTypeOnly })
				}
				i = j
				lastToken = ';'
				continue
			}
		}

		// 7. export ... from '...'
		if (
			sourceCode.startsWith('export', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1])) &&
			!/[\w$]/.test(sourceCode[i + 6] || '')
		) {
			let j = i + 6
			while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++

			let isTypeOnly = false
			const afterExport = sourceCode.slice(j, j + 50).trimStart()
			if (/^(const|let|var|function|class|default|interface|enum|async)\b/.test(afterExport)) {
				i += 6
				lastToken = 'export'
				continue
			}
			if (/^type\s+(?!from\s+)[\w${*]/.test(afterExport)) {
				isTypeOnly = true
			}

			let clause = ''
			let inBraces = 0
			let hasFrom = false
			let foundSpecifier = null

			while (j < n) {
				const c = sourceCode[j]

				if (c === '/' && sourceCode[j + 1] === '/') {
					j += 2
					while (j < n && sourceCode[j] !== '\n' && sourceCode[j] !== '\r') j++
					continue
				}
				if (c === '/' && sourceCode[j + 1] === '*') {
					j += 2
					while (j < n && !(sourceCode[j] === '*' && sourceCode[j + 1] === '/')) j++
					if (j < n) j += 2
					continue
				}

				if (c === '{') inBraces++
				if (c === '}') inBraces = Math.max(0, inBraces - 1)

				if (
					inBraces === 0 &&
					sourceCode.startsWith('from', j) &&
					!/[\w$]/.test(sourceCode[j - 1] || '') &&
					!/[\w$]/.test(sourceCode[j + 4] || '')
				) {
					hasFrom = true
					j += 4
					continue
				}

				if (hasFrom && (c === "'" || c === '"')) {
					const { spec, nextIdx } = readQuotedString(sourceCode, j)
					foundSpecifier = spec
					j = nextIdx
					break
				}

				if (c === ';' || (inBraces === 0 && (c === '\n' || c === '\r') && (sourceCode.startsWith('import', j + 1) || sourceCode.startsWith('export', j + 1)))) {
					break
				}

				clause += c
				j++
			}

			if (foundSpecifier) {
				if (!isTypeOnly && clause.includes('{') && clause.includes('}')) {
					const braceMatch = clause.match(/\{([^}]*)\}/)
					if (braceMatch) {
						const specifiersInside = braceMatch[1]
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean)
						if (specifiersInside.length > 0 && specifiersInside.every((s) => /^type\s+/.test(s))) {
							isTypeOnly = true
						}
					}
				}

				if (isValidSpecifier(foundSpecifier)) {
					results.push({ specifier: foundSpecifier.trim(), typeOnly: isTypeOnly })
				}
				i = j
				lastToken = ';'
				continue
			}
		}

		// 8. require('...')
		if (
			sourceCode.startsWith('require', i) &&
			(i === 0 || !/[\w$]/.test(sourceCode[i - 1])) &&
			!/[\w$]/.test(sourceCode[i + 7] || '')
		) {
			let j = i + 7
			while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++
			if (sourceCode[j] === '(') {
				j++
				while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++
				if (sourceCode[j] === "'" || sourceCode[j] === '"') {
					const { spec, nextIdx } = readQuotedString(sourceCode, j)
					j = nextIdx
					while (j < n && /[\s\r\n]/.test(sourceCode[j])) j++
					if (sourceCode[j] === ')') {
						if (isValidSpecifier(spec)) {
							results.push({ specifier: spec.trim(), typeOnly: false })
						}
					}
					i = j
					lastToken = ')'
					continue
				}
			}
		}

		// Track identifier words for regex disambiguation
		if (/[a-zA-Z_$]/.test(ch)) {
			let word = ''
			while (i < n && /[a-zA-Z0-9_$]/.test(sourceCode[i])) {
				word += sourceCode[i]
				i++
			}
			lastToken = word
			continue
		}

		i++
	}

	return results
}

function extractImportSpecifiers(sourceCode, options = {}) {
	const entries = extractImports(sourceCode)
	if (options && options.detailed) {
		return entries
	}
	return entries.map((e) => e.specifier)
}

/**
 * Parses <script src="..."> and <link href="..."> in HTML files.
 */
function extractHtmlEdges(htmlContent, htmlPath, filesMap, pathToId) {
	const foundEdgeIds = []
	if (!htmlContent || typeof htmlContent !== 'string') return foundEdgeIds
	const htmlDir = path.posix.dirname(htmlPath)

	const scriptRegex = /<script\b[^>]*?\bsrc\s*=\s*(['"])(.*?)\1/gi
	let match
	while ((match = scriptRegex.exec(htmlContent)) !== null) {
		const rawSrc = match[2].trim()
		if (
			rawSrc &&
			!rawSrc.startsWith('http:') &&
			!rawSrc.startsWith('https:') &&
			!rawSrc.startsWith('//') &&
			!rawSrc.startsWith('data:')
		) {
			let targetPath = rawSrc
			if (targetPath.startsWith('/')) {
				targetPath = targetPath.slice(1)
			} else {
				targetPath = path.posix.join(htmlDir, targetPath)
			}
			const resolved = resolveFilePath(targetPath, filesMap)
			if (resolved && pathToId.has(resolved)) {
				foundEdgeIds.push(pathToId.get(resolved))
			}
		}
	}

	const linkRegex = /<link\b[^>]*?\bhref\s*=\s*(['"])(.*?)\1/gi
	while ((match = linkRegex.exec(htmlContent)) !== null) {
		const rawHref = match[2].trim()
		if (
			rawHref &&
			!rawHref.startsWith('http:') &&
			!rawHref.startsWith('https:') &&
			!rawHref.startsWith('//') &&
			!rawHref.startsWith('data:')
		) {
			let targetPath = rawHref
			if (targetPath.startsWith('/')) {
				targetPath = targetPath.slice(1)
			} else {
				targetPath = path.posix.join(htmlDir, targetPath)
			}
			const resolved = resolveFilePath(targetPath, filesMap)
			if (resolved && pathToId.has(resolved)) {
				foundEdgeIds.push(pathToId.get(resolved))
			}
		}
	}

	return foundEdgeIds
}

function extractExportTargets(exportsField) {
	const targets = []
	if (!exportsField) return targets

	function traverse(val) {
		if (typeof val === 'string') {
			targets.push(val)
		} else if (Array.isArray(val)) {
			for (const item of val) traverse(item)
		} else if (val && typeof val === 'object') {
			for (const item of Object.values(val)) {
				traverse(item)
			}
		}
	}

	traverse(exportsField)
	return targets
}

/**
 * Extracts script content from Vue SFC files.
 */
function extractVueScript(content) {
	if (!content || typeof content !== 'string') return ''
	const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi
	let scripts = ''
	let match
	while ((match = scriptRegex.exec(content)) !== null) {
		scripts += match[1] + '\n'
	}
	return scripts || content
}

/**
 * Strips comments from JSON files before parsing (for tsconfig.json).
 */
function parseJsonWithComments(text) {
	if (!text) return null
	try {
		const clean = text
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*/g, '')
		return JSON.parse(clean)
	} catch {
		return null
	}
}

/**
 * Resolves a file path against the files map using extension & index resolution and TS mapping.
 */
function resolveFilePath(targetPath, filesMap) {
	const normalized = path.posix.normalize(targetPath).replace(/^\.\//, '')
	const cleanNorm = (normalized === '.' || normalized === '') ? '' : normalized

	// 1. Exact match
	if (cleanNorm && filesMap.has(cleanNorm)) {
		return cleanNorm
	}

	// 2. TypeScript .js -> .ts / .tsx mapping
	if (cleanNorm.endsWith('.js')) {
		const asTs = cleanNorm.slice(0, -3) + '.ts'
		if (filesMap.has(asTs)) return asTs
		const asTsx = cleanNorm.slice(0, -3) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
	}
	if (cleanNorm.endsWith('.jsx')) {
		const asTsx = cleanNorm.slice(0, -4) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
		const asTs = cleanNorm.slice(0, -4) + '.ts'
		if (filesMap.has(asTs)) return asTs
	}
	if (cleanNorm.endsWith('.mjs')) {
		const asMts = cleanNorm.slice(0, -4) + '.mts'
		if (filesMap.has(asMts)) return asMts
	}
	if (cleanNorm.endsWith('.cjs')) {
		const asCts = cleanNorm.slice(0, -4) + '.cts'
		if (filesMap.has(asCts)) return asCts
	}

	// 3. Try appending extensions
	for (const ext of RESOLVE_EXTENSIONS) {
		const withExt = cleanNorm ? (cleanNorm + ext) : ('index' + ext)
		if (filesMap.has(withExt)) {
			return withExt
		}
	}

	// 4. Try index files in directory
	for (const ext of RESOLVE_EXTENSIONS) {
		const asIndex = cleanNorm ? path.posix.join(cleanNorm, 'index' + ext) : ('index' + ext)
		if (filesMap.has(asIndex)) {
			return asIndex
		}
	}

	return null
}

function detectSccCycles(nodeSubset, edgeList, nodes, pathToId) {
	const cycles = []
	const adj = new Map()
	for (const id of nodeSubset) adj.set(id, [])
	for (const edge of edgeList) {
		const fromId = edge[0]
		const toId = edge[1]
		if (nodeSubset.has(fromId) && nodeSubset.has(toId)) {
			adj.get(fromId).push(toId)
		}
	}

	let tarjanIndex = 0
	const indices = new Map()
	const lowlink = new Map()
	const onStack = new Set()
	const stack = []

	function strongConnect(u) {
		indices.set(u, tarjanIndex)
		lowlink.set(u, tarjanIndex)
		tarjanIndex++
		stack.push(u)
		onStack.add(u)

		for (const v of adj.get(u) || []) {
			if (!indices.has(v)) {
				strongConnect(v)
				lowlink.set(u, Math.min(lowlink.get(u), lowlink.get(v)))
			} else if (onStack.has(v)) {
				lowlink.set(u, Math.min(lowlink.get(u), indices.get(v)))
			}
		}

		if (lowlink.get(u) === indices.get(u)) {
			const scc = []
			let w
			do {
				w = stack.pop()
				onStack.delete(w)
				scc.push(w)
			} while (w !== u)

			if (scc.length > 1 && cycles.length < 20) {
				const sccSet = new Set(scc)
				let bestLoop = null
				let bestLoopLength = Infinity

				const isAppRootNode = (nodeId) => {
					const p = nodes[nodeId]?.path || ''
					const base = path.posix.basename(p).toLowerCase()
					return /^(app|index|main)\.(jsx?|tsx?)$/i.test(base) || Boolean(nodes[nodeId]?.isEntry)
				}

				const sortedScc = [...scc].sort((a, b) => {
					const aRoot = isAppRootNode(a) ? 1 : 0
					const bRoot = isAppRootNode(b) ? 1 : 0
					return bRoot - aRoot
				})

				for (const startId of sortedScc) {
					const queue = []
					const visited = new Map()

					for (const v of adj.get(startId) || []) {
						if (sccSet.has(v)) {
							queue.push([startId, v])
							visited.set(v, 2)
						}
					}

					while (queue.length > 0) {
						const currentPath = queue.shift()
						if (currentPath.length > bestLoopLength) {
							break
						}
						const lastNode = currentPath[currentPath.length - 1]
						for (const nxt of adj.get(lastNode) || []) {
							if (nxt === startId) {
								if (currentPath.length < bestLoopLength) {
									bestLoop = currentPath
									bestLoopLength = currentPath.length
								} else if (
									currentPath.length === bestLoopLength &&
									!bestLoop?.some(isAppRootNode) &&
									currentPath.some(isAppRootNode)
								) {
									bestLoop = currentPath
								}
								break
							}
							if (sccSet.has(nxt) && !visited.has(nxt)) {
								visited.set(nxt, currentPath.length + 1)
								queue.push([...currentPath, nxt])
							}
						}
					}
				}

				if (!bestLoop) {
					bestLoop = [...scc]
				}

				const rootIdx = bestLoop.findIndex(isAppRootNode)
				if (rootIdx > 0) {
					bestLoop = [...bestLoop.slice(rootIdx), ...bestLoop.slice(0, rootIdx)]
				}

				const shortestLoopPaths = bestLoop.map((id) => nodes[id].path)
				const sccPaths = scc.map((id) => nodes[id].path)

				const appFile = sccPaths.find((p) => /^app\.(jsx?|tsx?)$/i.test(path.posix.basename(p)))
				const indexFile = sccPaths.find((p) => /^index\.(jsx?|tsx?)$/i.test(path.posix.basename(p)))
				const mainFile = sccPaths.find((p) => /^main\.(jsx?|tsx?)$/i.test(path.posix.basename(p)))
				const entryFile = sccPaths.find((p) => nodes[pathToId.get(p)]?.isEntry)
				const rootFileForHint = appFile || indexFile || mainFile || entryFile || null

				let hint = null
				if (rootFileForHint) {
					const rootName = path.posix.basename(rootFileForHint)
					hint = `Shared exports in ${rootName} are imported back by children; move them to a separate module.`
				}

				const cycleObj = Object.assign([...sccPaths], {
					files: sccPaths,
					shortest: shortestLoopPaths,
					hint,
					toJSON() {
						return {
							files: this.files,
							shortest: this.shortest,
							hint: this.hint,
						}
					},
				})

				cycles.push(cycleObj)
			}
		}
	}

	for (const id of nodeSubset) {
		if (!indices.has(id)) {
			strongConnect(id)
		}
	}

	return cycles
}

function resolveImportTarget(val) {
	if (!val) return null
	if (typeof val === 'string') return val
	if (typeof val === 'object') {
		return (
			resolveImportTarget(val.import) ||
			resolveImportTarget(val.default) ||
			resolveImportTarget(val.node) ||
			resolveImportTarget(Object.values(val)[0])
		)
	}
	return null
}

function extractBundlerAliases(filesMap) {
	const aliases = []

	for (const [filePath, fileData] of filesMap.entries()) {
		const base = path.posix.basename(filePath).toLowerCase()
		if ((base.startsWith('vite.config.') || base.startsWith('webpack.config.')) && fileData && fileData.text) {
			const text = fileData.text

			// Match object form: alias: { '@': path.resolve(...), '~': '...' }
			const objMatch = text.match(/alias\s*:\s*\{([^}]+)\}/)
			if (objMatch) {
				const body = objMatch[1]
				const lines = body.split('\n')
				for (const line of lines) {
					const kvMatch = line.match(/(['"]?)([@~#][\w\d._/-]*)\1\s*:\s*.*?(?:resolve\([^,]+,\s*)?['"`]([^'"`]+)['"`]/)
					if (kvMatch) {
						const find = kvMatch[2]
						const replacement = kvMatch[3].replace(/^\.\//, '').replace(/^\//, '')
						aliases.push({ find, replacement })
					}
				}
			}

			// Match array form: alias: [ { find: '@', replacement: '...' } ]
			const arrMatch = text.match(/alias\s*:\s*\[([\s\S]*?)\]/)
			if (arrMatch) {
				const body = arrMatch[1]
				const entryRegex = /\{\s*find\s*:\s*['"`]([@~#][\w\d._/-]*)['"`]\s*,\s*replacement\s*:\s*.*?(?:resolve\([^,]+,\s*)?['"`]([^'"`]+)['"`]/g
				let m
				while ((m = entryRegex.exec(body)) !== null) {
					const find = m[1]
					const replacement = m[2].replace(/^\.\//, '').replace(/^\//, '')
					aliases.push({ find, replacement })
				}
			}
		}
	}

	return aliases
}

/**
 * Builds the dependency graph from files and packages.
 */
function buildGraph(files, packageJsons = []) {
	const filesMap = new Map()
	for (const [p, val] of (files instanceof Map ? files.entries() : Object.entries(files || {}))) {
		if (typeof val === 'string') {
			filesMap.set(p, {
				text: val,
				size: Buffer.byteLength(val, 'utf8'),
				lang: detectLanguage(p),
			})
		} else if (val && typeof val === 'object') {
			filesMap.set(p, {
				...val,
				lang: val.lang || detectLanguage(p),
			})
		}
	}

	// Collect all package.json files
	const parsedPackageJsons = []
	if (Array.isArray(packageJsons) && packageJsons.length > 0) {
		for (const item of packageJsons) {
			const p = item.path || 'package.json'
			const dir = path.posix.dirname(p)
			parsedPackageJsons.push({
				path: p,
				dir: dir === '.' ? '' : dir,
				content: item.content || item,
			})
		}
	} else {
		for (const [filePath, fileData] of filesMap.entries()) {
			if (filePath === 'package.json' || filePath.endsWith('/package.json')) {
				if (fileData.text) {
					try {
						const pkg = JSON.parse(fileData.text)
						const dir = path.posix.dirname(filePath)
						parsedPackageJsons.push({
							path: filePath,
							dir: dir === '.' ? '' : dir,
							content: pkg,
						})
					} catch {
						// Ignore parse error
					}
				}
			}
		}
	}

	// Sort parsedPackageJsons by dir length descending so longest matching folder matches first
	parsedPackageJsons.sort((a, b) => b.dir.length - a.dir.length)

	// Helper to find nearest package.json for a file
	const getNearestPackage = (filePath) => {
		const clean = filePath.replace(/\\/g, '/')
		for (const pkgItem of parsedPackageJsons) {
			if (!pkgItem.dir) return pkgItem
			if (clean === pkgItem.dir || clean.startsWith(pkgItem.dir + '/')) {
				return pkgItem
			}
		}
		return parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0] || null
	}

	// Build map of monorepo workspace packages and local package names
	const workspacePackages = new Map()
	const localPackageNames = new Set()
	const allFilteredLocalOrProtocolDeps = new Set()

	for (const pkgItem of parsedPackageJsons) {
		const isNonProd =
			isNonProductionFile(pkgItem.path) ||
			(pkgItem.dir ? isNonProductionFile(pkgItem.dir + '/index.js') : false)
		pkgItem.isNonProd = Boolean(isNonProd)

		const pkg = pkgItem.content
		if (pkg.name) {
			localPackageNames.add(pkg.name)
			allFilteredLocalOrProtocolDeps.add(pkg.name)
			workspacePackages.set(pkg.name, {
				dir: pkgItem.dir,
				main: pkg.main || pkg.module,
				content: pkg,
			})
		}
	}

	const allDeclaredDependencies = new Set()

	for (const pkgItem of parsedPackageJsons) {
		const pkg = pkgItem.content
		const deps = {
			...(pkg.dependencies || {}),
			...(pkg.devDependencies || {}),
			...(pkg.peerDependencies || {}),
			...(pkg.optionalDependencies || {}),
		}

		for (const [depName, version] of Object.entries(deps)) {
			if (isIgnoredDependency(depName, version, localPackageNames)) {
				allFilteredLocalOrProtocolDeps.add(depName)
				continue
			}
			// Dependencies of non-production package.json files are excluded from the production aggregate
			if (!pkgItem.isNonProd) {
				allDeclaredDependencies.add(depName)
			}
		}
	}

	// Read tsconfig / jsconfig paths and baseUrl
	let tsconfigPaths = null
	let tsconfigBaseUrl = '.'
	for (const configName of ['tsconfig.json', 'jsconfig.json']) {
		if (filesMap.has(configName) && filesMap.get(configName).text) {
			const config = parseJsonWithComments(filesMap.get(configName).text)
			if (config && config.compilerOptions) {
				if (config.compilerOptions.baseUrl) {
					tsconfigBaseUrl = config.compilerOptions.baseUrl.replace(/^[./]+/, '') || '.'
				}
				if (config.compilerOptions.paths && typeof config.compilerOptions.paths === 'object') {
					tsconfigPaths = config.compilerOptions.paths
				}
			}
			break
		}
	}

	const bundlerAliases = extractBundlerAliases(filesMap)

	// Identify candidate code files
	const codeFileEntries = []
	for (const [filePath, fileData] of filesMap.entries()) {
		const ext = path.posix.extname(filePath).toLowerCase()
		if (CODE_EXTENSIONS.has(ext)) {
			codeFileEntries.push([filePath, fileData])
		}
	}

	let truncated = false
	let graphNodesOmitted = 0
	if (codeFileEntries.length > MAX_NODES) {
		truncated = true
		graphNodesOmitted = codeFileEntries.length - MAX_NODES
		codeFileEntries.length = MAX_NODES
	}

	// Create nodes
	const nodes = []
	const pathToId = new Map()

	codeFileEntries.forEach(([filePath, fileData], index) => {
		const id = index
		pathToId.set(filePath, id)
		const lines = fileData.text ? fileData.text.split(/\r?\n/).length : 0
		const isNonProd = isNonProductionFile(filePath)

		nodes.push({
			id,
			path: filePath,
			lang: fileData.lang,
			size: fileData.size || 0,
			loc: lines,
			fanIn: 0,
			fanOut: 0,
			isEntry: false,
			isOrphan: false,
			isConfig: isConfigFile(filePath),
			isTest: isTestFile(filePath),
			category: isNonProd ? 'non-production' : 'production',
		})
	})

	// Detect entry points
	const entryPointsSet = new Set()
	const packageDirs = parsedPackageJsons.map((p) => p.dir || '.')
	if (!packageDirs.includes('.')) {
		packageDirs.push('.')
	}
	packageDirs.sort((a, b) => b.length - a.length)

	const resolvePkgRelative = (dir, target) => {
		if (!target || typeof target !== 'string') return null
		let clean = target.trim().replace(/^['"]+|['"]+$/g, '').replace(/\\/g, '/')
		if (clean.startsWith('./')) {
			clean = clean.slice(2)
		}
		if (!clean) return null
		const joined = !dir || dir === '.' ? clean : path.posix.join(dir, clean)
		const normalized = path.posix.normalize(joined)
		if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
			return null
		}
		return normalized
	}

	const SCRIPT_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.mts'])

	for (const pkgItem of parsedPackageJsons) {
		const p = pkgItem.content
		const dir = pkgItem.dir

		if (p.main) {
			const resolved = resolvePkgRelative(dir, p.main)
			if (resolved) entryPointsSet.add(resolved)
		}
		if (p.module) {
			const resolved = resolvePkgRelative(dir, p.module)
			if (resolved) entryPointsSet.add(resolved)
		}
		if (p.bin) {
			if (typeof p.bin === 'string') {
				const resolved = resolvePkgRelative(dir, p.bin)
				if (resolved) entryPointsSet.add(resolved)
			} else if (typeof p.bin === 'object') {
				for (const binPath of Object.values(p.bin)) {
					if (typeof binPath === 'string') {
						const resolved = resolvePkgRelative(dir, binPath)
						if (resolved) entryPointsSet.add(resolved)
					}
				}
			}
		}
		if (p.exports) {
			const targets = extractExportTargets(p.exports)
			for (const expTarget of targets) {
				const resolved = resolvePkgRelative(dir, expTarget)
				if (resolved) entryPointsSet.add(resolved)
			}
		}
		if (p.scripts && typeof p.scripts === 'object') {
			for (const script of Object.values(p.scripts)) {
				if (typeof script !== 'string') continue
				const scriptTokens = script.split(/\s+/)
				for (const token of scriptTokens) {
					let cleanToken = token.trim().replace(/^['"]+|['"]+$/g, '').replace(/\\/g, '/')
					if (cleanToken.startsWith('./')) {
						cleanToken = cleanToken.slice(2)
					}
					const ext = path.posix.extname(cleanToken).toLowerCase()
					if (SCRIPT_EXTENSIONS.has(ext)) {
						const resolved = resolvePkgRelative(dir, cleanToken)
						if (resolved) entryPointsSet.add(resolved)
					}
				}
			}
		}
	}

	// Heuristic entry points: index./main./app./server. count as entry
	// ONLY at package root or one level below it (e.g. src/), not in deeper folders.
	const isAtPackageRootOrOneLevelBelow = (filePath) => {
		let bestPkgDir = '.'
		for (const pkgDir of packageDirs) {
			if (pkgDir === '.') continue
			if (filePath === pkgDir || filePath.startsWith(pkgDir + '/')) {
				if (pkgDir.length > bestPkgDir.length || bestPkgDir === '.') {
					bestPkgDir = pkgDir
				}
			}
		}
		const rel = bestPkgDir === '.' ? filePath : filePath.slice(bestPkgDir.length + 1)
		const dirPart = path.posix.dirname(rel)
		return dirPart === '.' || !dirPart.includes('/')
	}

	for (const node of nodes) {
		const base = path.posix.basename(node.path).toLowerCase()
		const isCommonEntryName =
			base.startsWith('index.') ||
			base.startsWith('main.') ||
			base.startsWith('app.') ||
			base.startsWith('server.')

		const isHeuristicEntry = isCommonEntryName && isAtPackageRootOrOneLevelBelow(node.path)

		if (isHeuristicEntry || entryPointsSet.has(node.path) || isToolEntryCandidate(node.path)) {
			node.isEntry = true
		}
	}

	// Resolve imports and construct edges
	const edgeMap = new Map() // key: fromId->toId -> { from, to, typeOnly: boolean }
	const externalsMap = new Map()
	const prodExternalsAll = new Set()
	const packageImporters = new Map() // normName -> Set<filePath>
	const pkgPackageImporters = new Map() // dir -> Map(normName -> Set<filePath>)
	const pkgProdExternals = new Map() // dir -> Set of external pkg names
	for (const pkgItem of parsedPackageJsons) {
		pkgProdExternals.set(pkgItem.dir, new Set())
		pkgPackageImporters.set(pkgItem.dir, new Map())
	}

	const allUnresolvedImports = []

	for (const node of nodes) {
		const fileData = filesMap.get(node.path)
		if (!fileData || !fileData.text) continue

		const nearestPkg = getNearestPackage(node.path)

		// 1. HTML files: parse <script src> and <link href>, mark as entry candidate
		if (node.path.endsWith('.html')) {
			node.isEntry = true
			const targetIds = extractHtmlEdges(fileData.text, node.path, filesMap, pathToId)
			for (const toId of targetIds) {
				if (node.id !== toId) {
					const edgeKey = `${node.id}->${toId}`
					if (!edgeMap.has(edgeKey)) {
						edgeMap.set(edgeKey, { from: node.id, to: toId, typeOnly: false })
					}
				}
			}
			continue
		}

		let source = fileData.text
		if (node.path.endsWith('.vue')) {
			source = extractVueScript(source)
		}

		const importEntries = extractImports(source)

		for (const { specifier, typeOnly } of importEntries) {
			let resolvedPath = null

			// 1. Subpath imports: #x resolves through nearest package.json "imports" field
			if (specifier.startsWith('#')) {
				let resolvedSubpath = null
				if (nearestPkg && nearestPkg.content && nearestPkg.content.imports) {
					const importsField = nearestPkg.content.imports
					for (const [key, val] of Object.entries(importsField)) {
						const target = resolveImportTarget(val)
						if (typeof target === 'string') {
							if (key.endsWith('*') && specifier.startsWith(key.slice(0, -1))) {
								const wildcardPart = specifier.slice(key.slice(0, -1).length)
								const subTarget = target.replace('*', wildcardPart)
								const candidate = !nearestPkg.dir || nearestPkg.dir === '.'
									? subTarget
									: path.posix.join(nearestPkg.dir, subTarget)
								resolvedSubpath = resolveFilePath(candidate, filesMap)
								if (resolvedSubpath) break
							} else if (key === specifier) {
								const candidate = !nearestPkg.dir || nearestPkg.dir === '.'
									? target
									: path.posix.join(nearestPkg.dir, target)
								resolvedSubpath = resolveFilePath(candidate, filesMap)
								if (resolvedSubpath) break
							}
						}
					}
				}

				if (resolvedSubpath && pathToId.has(resolvedSubpath)) {
					const toId = pathToId.get(resolvedSubpath)
					if (node.id !== toId) {
						const edgeKey = `${node.id}->${toId}`
						if (!edgeMap.has(edgeKey)) {
							edgeMap.set(edgeKey, { from: node.id, to: toId, typeOnly })
						} else if (!typeOnly) {
							edgeMap.get(edgeKey).typeOnly = false
						}
					}
				} else if (!resolvedSubpath) {
					allUnresolvedImports.push({
						from: node.path,
						specifier,
						reason: 'package-imports-unresolved',
						category: node.category,
					})
				}
				// Else counts as an internal alias (never undeclared)
				continue
			}

			// 2. Relative imports
			if (isRelativeSpecifier(specifier)) {
				const fromDir = path.posix.dirname(node.path)
				const target = path.posix.join(fromDir, specifier)
				resolvedPath = resolveFilePath(target, filesMap)
				if (!resolvedPath) {
					const normTarget = path.posix.normalize(target).replace(/^\.\//, '')
					const cleanTarget = (normTarget === '.' || normTarget === '') ? '' : normTarget
					let isDir = cleanTarget === '' || specifier.endsWith('/') || specifier === '.' || specifier === '..' || specifier === './' || specifier === '../'
					if (!isDir && cleanTarget) {
						const prefix = cleanTarget + '/'
						for (const p of filesMap.keys()) {
							if (p.startsWith(prefix)) {
								isDir = true
								break
							}
						}
					}
					const reason = isDir ? 'directory-index-not-found' : 'relative-not-found'
					allUnresolvedImports.push({
						from: node.path,
						specifier,
						reason,
						category: node.category,
					})
				}
			} else {
				// 3. Try tsconfig / jsconfig paths matching
				if (tsconfigPaths) {
					for (const [pattern, targetList] of Object.entries(tsconfigPaths)) {
						if (pattern.endsWith('*')) {
							const prefix = pattern.slice(0, -1)
							if (specifier.startsWith(prefix)) {
								const starValue = specifier.slice(prefix.length)
								for (const targetPattern of targetList) {
									const candidateTarget = targetPattern.replace('*', starValue)
									const fullCandidate = tsconfigBaseUrl === '.'
										? candidateTarget
										: path.posix.join(tsconfigBaseUrl, candidateTarget)
									resolvedPath = resolveFilePath(fullCandidate, filesMap)
									if (resolvedPath) break
								}
							}
						} else if (specifier === pattern) {
							for (const targetPattern of targetList) {
								const fullCandidate = tsconfigBaseUrl === '.'
									? targetPattern
									: path.posix.join(tsconfigBaseUrl, targetPattern)
								resolvedPath = resolveFilePath(fullCandidate, filesMap)
								if (resolvedPath) break
							}
						}
						if (resolvedPath) break
					}
				}

				// Try bundler aliases (vite / webpack)
				if (!resolvedPath && bundlerAliases.length > 0) {
					for (const alias of bundlerAliases) {
						if (specifier === alias.find) {
							resolvedPath = resolveFilePath(alias.replacement, filesMap)
							if (resolvedPath) break
						} else if (specifier.startsWith(alias.find + '/')) {
							const rest = specifier.slice(alias.find.length + 1)
							const candidate = path.posix.join(alias.replacement, rest)
							resolvedPath = resolveFilePath(candidate, filesMap)
							if (resolvedPath) break
						}
					}
				}

				// Try tsconfig / jsconfig baseUrl fallback
				if (!resolvedPath && tsconfigBaseUrl && tsconfigBaseUrl !== '.' && !specifier.startsWith('/')) {
					const candidate = path.posix.join(tsconfigBaseUrl, specifier)
					resolvedPath = resolveFilePath(candidate, filesMap)
				}

				// Check monorepo workspace packages
				if (!resolvedPath && workspacePackages.size > 0) {
					for (const [pkgName, pkgMeta] of workspacePackages.entries()) {
						if (specifier === pkgName || specifier.startsWith(pkgName + '/')) {
							const subpath = specifier.slice(pkgName.length).replace(/^\//, '')
							if (!subpath) {
								if (pkgMeta.main) {
									const candidate = path.posix.join(pkgMeta.dir, pkgMeta.main)
									resolvedPath = resolveFilePath(candidate, filesMap)
								}
								if (!resolvedPath) {
									resolvedPath = resolveFilePath(path.posix.join(pkgMeta.dir, 'index'), filesMap)
								}
							} else {
								resolvedPath = resolveFilePath(path.posix.join(pkgMeta.dir, subpath), filesMap)
							}
							if (resolvedPath) break
						}
					}
				}

				// Check aliases: Only "~x", "@/x" and names matching a configured alias are aliases.
				// A bare npm name should be an external package (declared or undeclared), never an alias.
				let isConfiguredAlias = false

				// 1. "~x" or "@/x"
				if (specifier.startsWith('~') || specifier.startsWith('@/')) {
					isConfiguredAlias = true
				}

				// 2. Names matching a configured tsconfig path alias
				if (!isConfiguredAlias && tsconfigPaths) {
					for (const pattern of Object.keys(tsconfigPaths)) {
						if (pattern.endsWith('*')) {
							const prefix = pattern.slice(0, -1)
							if (prefix && specifier.startsWith(prefix)) {
								isConfiguredAlias = true
								break
							}
						} else if (specifier === pattern) {
							isConfiguredAlias = true
							break
						}
					}
				}

				// 3. Names matching a configured bundler alias
				if (!isConfiguredAlias && bundlerAliases.length > 0) {
					for (const a of bundlerAliases) {
						if (a.find === '@') {
							if (specifier === '@' || specifier.startsWith('@/')) {
								isConfiguredAlias = true
								break
							}
						} else if (specifier === a.find || specifier.startsWith(a.find + '/')) {
							isConfiguredAlias = true
							break
						}
					}
				}

				if (!resolvedPath && isConfiguredAlias) {
					allUnresolvedImports.push({
						from: node.path,
						specifier,
						reason: 'alias-unresolved',
						category: node.category,
					})
					continue
				}
			}

			if (resolvedPath && pathToId.has(resolvedPath)) {
				const toId = pathToId.get(resolvedPath)
				if (node.id !== toId) {
					const edgeKey = `${node.id}->${toId}`
					if (!edgeMap.has(edgeKey)) {
						edgeMap.set(edgeKey, { from: node.id, to: toId, typeOnly })
					} else if (!typeOnly) {
						edgeMap.get(edgeKey).typeOnly = false
					}
				}
			} else if (specifier.startsWith('/')) {
				allUnresolvedImports.push({
					from: node.path,
					specifier,
					reason: 'other',
					category: node.category,
				})
			} else if (
				!isRelativeSpecifier(specifier) &&
				!specifier.startsWith('/') &&
				!specifier.startsWith('~') &&
				!specifier.startsWith('@/')
			) {
				// Bare specifier = External package
				// Ignore workspace packages, local package names, and filtered protocol dependencies
				if (
					workspacePackages.has(specifier) ||
					localPackageNames.has(specifier) ||
					allFilteredLocalOrProtocolDeps.has(specifier) ||
					Array.from(workspacePackages.keys()).some((k) => specifier.startsWith(k + '/')) ||
					Array.from(localPackageNames).some((k) => specifier.startsWith(k + '/'))
				) {
					continue
				}

				const normName = normalizeExternalPackageName(specifier)
				if (!normName) {
					allUnresolvedImports.push({
						from: node.path,
						specifier,
						reason: 'other',
						category: node.category,
					})
					continue
				}
				if (
					normName &&
					!isRelativeSpecifier(normName) &&
					!localPackageNames.has(normName) &&
					!allFilteredLocalOrProtocolDeps.has(normName)
				) {
					externalsMap.set(normName, (externalsMap.get(normName) || 0) + 1)
					if (node.category === 'production') {
						prodExternalsAll.add(normName)
						if (nearestPkg && pkgProdExternals.has(nearestPkg.dir)) {
							pkgProdExternals.get(nearestPkg.dir).add(normName)
						}

						// Track up to 3 source file paths per undeclared package
						if (!packageImporters.has(normName)) {
							packageImporters.set(normName, new Set())
						}
						const s = packageImporters.get(normName)
						if (s.size < 3) {
							s.add(node.path)
						}

						if (nearestPkg && pkgPackageImporters.has(nearestPkg.dir)) {
							const pMap = pkgPackageImporters.get(nearestPkg.dir)
							if (!pMap.has(normName)) {
								pMap.set(normName, new Set())
							}
							const ps = pMap.get(normName)
							if (ps.size < 3) {
								ps.add(node.path)
							}
						}
					}
				}
			}
		}
	}

	// Construct edges array: [fromId, toId, { typeOnly }]
	const edges = []
	for (const item of edgeMap.values()) {
		const edge = [item.from, item.to, { typeOnly: Boolean(item.typeOnly) }]
		edge.typeOnly = Boolean(item.typeOnly)
		edges.push(edge)
	}

	// Calculate fanIn and fanOut
	for (const [fromId, toId] of edges) {
		if (nodes[fromId]) nodes[fromId].fanOut++
		if (nodes[toId]) nodes[toId].fanIn++
	}

	// Collect config files
	const configFilesSet = new Set(nodes.filter((n) => n.isConfig).map((n) => n.path))
	for (const filePath of filesMap.keys()) {
		if (isConfigFile(filePath)) {
			configFilesSet.add(filePath)
		}
	}
	const configFiles = Array.from(configFilesSet)

	// Identify orphans: only production nodes, not special
	const orphans = []
	for (const node of nodes) {
		const isSpecial =
			node.isEntry ||
			node.isConfig ||
			node.isTest ||
			isToolEntryCandidate(node.path) ||
			isConfigFile(node.path) ||
			isTestFile(node.path) ||
			isTestSetupFile(node.path) ||
			isDeclarationFile(node.path)

		if (node.fanIn === 0 && node.fanOut === 0 && !isSpecial) {
			node.isOrphan = true
			if (node.category === 'production') {
				orphans.push(node.path)
			}
		} else {
			node.isOrphan = false
		}
	}

	// Detect Cycles
	// 1. Production runtime cycles: production nodes only, non-typeOnly edges
	const prodNodeSet = new Set(nodes.filter((n) => n.category === 'production').map((n) => n.id))
	const valueEdges = edges.filter((e) => e.typeOnly !== true)
	const cycles = detectSccCycles(prodNodeSet, valueEdges, nodes, pathToId)

	// 2. Type-only cycles: production cycles with all edges that involve at least one typeOnly edge
	const allProdCycles = detectSccCycles(prodNodeSet, edges, nodes, pathToId)
	const typeOnlyCycles = allProdCycles.filter((c) => {
		for (let i = 0; i < c.shortest.length; i++) {
			const fromPath = c.shortest[i]
			const toPath = c.shortest[(i + 1) % c.shortest.length]
			const fromId = pathToId.get(fromPath)
			const toId = pathToId.get(toPath)
			const edge = edges.find((e) => e[0] === fromId && e[1] === toId)
			if (edge && edge.typeOnly) return true
		}
		return false
	})

	// 3. Non-production cycles and orphans
	const allNodeSet = new Set(nodes.map((n) => n.id))
	const allGraphCycles = detectSccCycles(allNodeSet, edges, nodes, pathToId)
	const nonProdCycles = allGraphCycles.filter((c) =>
		c.files.some((f) => nodes[pathToId.get(f)]?.category === 'non-production')
	)
	const nonProdOrphans = nodes.filter(
		(n) =>
			n.category === 'non-production' &&
			n.fanIn === 0 &&
			n.fanOut === 0 &&
			!n.isEntry &&
			!n.isConfig &&
			!n.isTest &&
			!isToolEntryCandidate(n.path) &&
			!isConfigFile(n.path) &&
			!isTestFile(n.path) &&
			!isTestSetupFile(n.path) &&
			!isDeclarationFile(n.path)
	)

	const summaryNonProduction = {
		cycles: nonProdCycles.length,
		orphans: nonProdOrphans.length,
	}

	// Longest dependency chain (topological depth)
	const memoChain = new Map()
	const visiting = new Set()
	const prodAdj = new Map()
	for (const id of prodNodeSet) prodAdj.set(id, [])
	for (const [fromId, toId] of valueEdges) {
		if (prodNodeSet.has(fromId) && prodNodeSet.has(toId)) {
			prodAdj.get(fromId).push(toId)
		}
	}

	function getChainLength(u) {
		if (memoChain.has(u)) return memoChain.get(u)
		if (visiting.has(u)) return 0 // cycle break
		visiting.add(u)

		let maxSub = 0
		for (const v of prodAdj.get(u) || []) {
			maxSub = Math.max(maxSub, getChainLength(v))
		}

		visiting.delete(u)
		const res = 1 + maxSub
		memoChain.set(u, res)
		return res
	}

	let longestChain = 0
	for (const node of nodes) {
		if (node.category === 'production') {
			longestChain = Math.max(longestChain, getChainLength(node.id))
		}
	}

	// Build compact externals
	const externals = []
	const usedExternalNames = new Set()
	for (const [name, count] of externalsMap.entries()) {
		const isBuiltin = isNodeBuiltin(name)
		const isDeclared = allDeclaredDependencies.has(name) || isBuiltin
		usedExternalNames.add(name)
		externals.push({
			name,
			count,
			declared: isDeclared,
		})
	}
	externals.sort((a, b) => b.count - a.count)

	// Collect tools referenced in scripts, configs, and package.json keys per package
	const IGNORED_PKG_KEYS = ['lint-staged', 'simple-git-hooks', 'husky', 'prettier', 'eslintConfig']
	const PKG_KEY_TOOL_MAP = {
		'lint-staged': 'lint-staged',
		'simple-git-hooks': 'simple-git-hooks',
		husky: 'husky',
		prettier: 'prettier',
		eslintConfig: 'eslint',
	}

	const pkgReferencedTools = new Map()
	for (const pkgItem of parsedPackageJsons) {
		const refSet = new Set()
		const p = pkgItem.content

		// 1. Package.json keys
		for (const key of IGNORED_PKG_KEYS) {
			if (p[key] !== undefined) {
				const tool = PKG_KEY_TOOL_MAP[key]
				if (tool) refSet.add(tool)
				if (typeof p[key] === 'object' && p[key] !== null) {
					const str = JSON.stringify(p[key])
					for (const dep of allDeclaredDependencies) {
						if (str.includes(`"${dep}"`) || str.includes(`'${dep}'`)) {
							refSet.add(dep)
						}
					}
				}
			}
		}

		// 2. Scripts
		if (p.scripts && typeof p.scripts === 'object') {
			for (const script of Object.values(p.scripts)) {
				if (typeof script !== 'string') continue
				const tokens = script.split(/\s+/)
				for (const rawToken of tokens) {
					const token = rawToken.replace(/^['"]+|['"]+$/g, '')
					const aliased = BIN_ALIASES[token] || BIN_ALIASES[path.posix.basename(token)]
					if (aliased) {
						refSet.add(aliased)
					}
					for (const dep of allDeclaredDependencies) {
						if (token === dep || token.startsWith(dep + '/')) {
							refSet.add(dep)
						}
					}
				}
			}
		}

		// 3. Config files in package dir or root
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isConfigFile(filePath) && fileData.text) {
				const nearest = getNearestPackage(filePath)
				if (!nearest || nearest.dir === pkgItem.dir || !pkgItem.dir) {
					const text = fileData.text
					for (const dep of allDeclaredDependencies) {
						if (refSet.has(dep)) continue
						const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
						const quotedRegex = new RegExp(`['"\`]${escaped}(?:/[^'"\`]*)?['"\`]`)
						const keyRegex = new RegExp('(^|[\\s{,])' + escaped + '\\s*:')
						if (quotedRegex.test(text) || keyRegex.test(text)) {
							refSet.add(dep)
						}
					}
				}
			}
		}

		pkgReferencedTools.set(pkgItem.dir, refSet)
	}

	// Aggregate referenced tools
	const allReferencedInScriptsOrConfigs = new Set()
	for (const refSet of pkgReferencedTools.values()) {
		for (const item of refSet) {
			allReferencedInScriptsOrConfigs.add(item)
		}
	}

	// Compute per-package declaredButUnused and usedButUndeclared
	const summaryPackages = []
	const NOTE_TEXT = 'may be used via config or string references'

	for (const pkgItem of parsedPackageJsons) {
		const p = pkgItem.content
		const rawDeps = {
			...(p.dependencies || {}),
			...(p.devDependencies || {}),
			...(p.peerDependencies || {}),
			...(p.optionalDependencies || {}),
		}
		const pkgDeclared = new Set()
		for (const [depName, version] of Object.entries(rawDeps)) {
			if (!isIgnoredDependency(depName, version, localPackageNames)) {
				pkgDeclared.add(depName)
			}
		}

		const pkgUsedInProd = pkgProdExternals.get(pkgItem.dir) || new Set()
		const pkgRefs = pkgReferencedTools.get(pkgItem.dir) || new Set()

		const pkgDeclaredButUnused = []
		for (const dep of pkgDeclared) {
			if (
				!pkgUsedInProd.has(dep) &&
				!isNodeBuiltin(dep) &&
				!workspacePackages.has(dep) &&
				!localPackageNames.has(dep) &&
				!allFilteredLocalOrProtocolDeps.has(dep) &&
				!isIgnoredToolingPackage(dep) &&
				!pkgRefs.has(dep)
			) {
				pkgDeclaredButUnused.push(dep)
			}
		}

		const pkgUsedButUndeclared = []
		for (const dep of pkgUsedInProd) {
			if (
				!pkgDeclared.has(dep) &&
				!isNodeBuiltin(dep) &&
				!workspacePackages.has(dep) &&
				!localPackageNames.has(dep) &&
				!allFilteredLocalOrProtocolDeps.has(dep)
			) {
				pkgUsedButUndeclared.push(dep)
			}
		}

		const pkgUndeclaredSources = {}
		const pMap = pkgPackageImporters.get(pkgItem.dir)
		for (const name of pkgUsedButUndeclared) {
			pkgUndeclaredSources[name] = Array.from(pMap?.get(name) || [])
		}

		Object.defineProperty(pkgDeclaredButUnused, 'note', {
			value: NOTE_TEXT,
			enumerable: false,
			writable: true,
			configurable: true,
		})
		Object.defineProperty(pkgUsedButUndeclared, 'undeclaredSources', {
			value: pkgUndeclaredSources,
			enumerable: false,
			writable: true,
			configurable: true,
		})

		const pkgResult = {
			name: p.name || pkgItem.dir || 'root',
			path: pkgItem.path,
			dir: pkgItem.dir,
			isNonProduction: pkgItem.isNonProd,
			declaredButUnused: pkgDeclaredButUnused,
			declaredButUnusedNote: NOTE_TEXT,
			usedButUndeclared: pkgUsedButUndeclared,
			undeclaredSources: pkgUndeclaredSources,
		}

		summaryPackages.push(pkgResult)
		if (p.name) {
			summaryPackages[p.name] = pkgResult
		}
		summaryPackages[pkgItem.path] = pkgResult
	}

	// Compute aggregate declaredButUnused and usedButUndeclared
	const declaredButUnused = []
	for (const dep of allDeclaredDependencies) {
		if (
			!prodExternalsAll.has(dep) &&
			!isNodeBuiltin(dep) &&
			!workspacePackages.has(dep) &&
			!localPackageNames.has(dep) &&
			!allFilteredLocalOrProtocolDeps.has(dep) &&
			!isIgnoredToolingPackage(dep) &&
			!allReferencedInScriptsOrConfigs.has(dep)
		) {
			declaredButUnused.push(dep)
		}
	}

	const usedButUndeclared = []
	for (const name of prodExternalsAll) {
		if (
			!allDeclaredDependencies.has(name) &&
			!isNodeBuiltin(name) &&
			!workspacePackages.has(name) &&
			!localPackageNames.has(name) &&
			!allFilteredLocalOrProtocolDeps.has(name)
		) {
			usedButUndeclared.push(name)
		}
	}

	const undeclaredSources = {}
	for (const name of usedButUndeclared) {
		undeclaredSources[name] = Array.from(packageImporters.get(name) || [])
	}

	Object.defineProperty(declaredButUnused, 'note', {
		value: NOTE_TEXT,
		enumerable: false,
		writable: true,
		configurable: true,
	})
	Object.defineProperty(usedButUndeclared, 'undeclaredSources', {
		value: undeclaredSources,
		enumerable: false,
		writable: true,
		configurable: true,
	})

	// Populate non-production package metrics into summaryNonProduction
	let nonProdPackagesCount = 0
	let nonProdDeclaredCount = 0
	let nonProdDeclaredButUnusedCount = 0
	let nonProdUsedButUndeclaredCount = 0

	for (const pkgItem of parsedPackageJsons) {
		if (pkgItem.isNonProd) {
			nonProdPackagesCount++
			const p = pkgItem.content
			const rawDeps = {
				...(p.dependencies || {}),
				...(p.devDependencies || {}),
				...(p.peerDependencies || {}),
				...(p.optionalDependencies || {}),
			}
			nonProdDeclaredCount += Object.keys(rawDeps).length
		}
	}

	for (const pkg of summaryPackages) {
		if (pkg.isNonProduction) {
			nonProdDeclaredButUnusedCount += pkg.declaredButUnused.length
			nonProdUsedButUndeclaredCount += pkg.usedButUndeclared.length
		}
	}

	summaryNonProduction.packages = nonProdPackagesCount
	summaryNonProduction.declaredDependencies = nonProdDeclaredCount
	summaryNonProduction.declaredButUnused = nonProdDeclaredButUnusedCount
	summaryNonProduction.usedButUndeclared = nonProdUsedButUndeclaredCount

	const totalUnresolvedCount = allUnresolvedImports.length
	const isTruncated = totalUnresolvedCount > 500
	const unresolvedImports = allUnresolvedImports.slice(0, 500)
	unresolvedImports.truncated = isTruncated
	unresolvedImports.count = totalUnresolvedCount
	unresolvedImports.totalCount = totalUnresolvedCount

	const unresolvedByReason = {
		'relative-not-found': 0,
		'directory-index-not-found': 0,
		'alias-unresolved': 0,
		'package-imports-unresolved': 0,
		'other': 0,
	}

	let nonProdUnresolvedCount = 0

	for (const item of allUnresolvedImports) {
		if (item.category === 'production') {
			if (unresolvedByReason[item.reason] !== undefined) {
				unresolvedByReason[item.reason]++
			} else {
				unresolvedByReason['other']++
			}
		} else {
			nonProdUnresolvedCount++
		}
	}

	Object.defineProperty(unresolvedByReason, 'missing_relative', {
		get() {
			return (this['relative-not-found'] || 0) + (this['directory-index-not-found'] || 0)
		},
		enumerable: false,
		configurable: true,
	})
	Object.defineProperty(unresolvedByReason, 'unresolved_alias', {
		get() {
			return this['alias-unresolved'] || 0
		},
		enumerable: false,
		configurable: true,
	})

	summaryNonProduction.unresolved = nonProdUnresolvedCount

	// Calculate hotspots (production files only, excluding config files)
	// 1. Top 10 by fanIn
	const sortedByFanIn = nodes
		.filter((n) => n.category === 'production' && n.fanIn > 0 && !n.isConfig)
		.sort((a, b) => b.fanIn - a.fanIn)
		.slice(0, 10)
		.map((n) => ({ id: n.id, path: n.path, fanIn: n.fanIn }))

	// 2. Top 10 by transitive impact (reverse BFS, production only, excluding config files)
	const incomingAdj = new Map()
	for (const id of prodNodeSet) incomingAdj.set(id, [])
	for (const [fromId, toId] of valueEdges) {
		if (prodNodeSet.has(fromId) && prodNodeSet.has(toId)) {
			incomingAdj.get(toId).push(fromId)
		}
	}

	const impactScores = []
	for (const node of nodes) {
		if (node.category !== 'production' || node.isConfig) continue
		let count = 0
		const visited = new Set([node.id])
		const queue = [node.id]
		while (queue.length > 0) {
			const curr = queue.shift()
			for (const parent of incomingAdj.get(curr) || []) {
				if (!visited.has(parent)) {
					visited.add(parent)
					count++
					queue.push(parent)
				}
			}
		}
		if (count > 0) {
			impactScores.push({
				id: node.id,
				path: node.path,
				transitiveCount: count,
				percent: prodNodeSet.size > 0 ? Number(((count / prodNodeSet.size) * 100).toFixed(1)) : 0,
			})
		}
	}

	impactScores.sort((a, b) => b.transitiveCount - a.transitiveCount)
	const sortedByTransitiveImpact = impactScores.slice(0, 10)

	// Language coverage metrics
	const graphLanguages = {}
	for (const node of nodes) {
		const lang = node.lang || 'other'
		graphLanguages[lang] = (graphLanguages[lang] || 0) + 1
	}

	const STANDARD_INVENTORY_LANGUAGES = new Set([
		'javascript', 'jsx', 'typescript', 'tsx', 'vue',
		'json', 'markdown', 'html', 'css', 'scss', 'sass', 'less',
		'python', 'go', 'rust', 'java', 'c', 'cpp', 'ruby', 'php',
		'shell', 'yaml', 'sql', 'xml', 'graphql', 'svg'
	])

	const inventoryOnlyLanguages = {}
	for (const [filePath, fileData] of filesMap.entries()) {
		if (!pathToId.has(filePath)) {
			let lang = fileData.lang || detectLanguage(filePath)
			if (lang !== 'binary') {
				const lower = lang.toLowerCase()
				const canonicalLang = STANDARD_INVENTORY_LANGUAGES.has(lower) ? lower : 'other'
				inventoryOnlyLanguages[canonicalLang] = (inventoryOnlyLanguages[canonicalLang] || 0) + 1
			}
		}
	}

	const coverage = {
		graphLanguages,
		inventoryOnlyLanguages,
		graphFiles: nodes.length,
	}

	// Production entry points capped at 25
	const productionEntryPoints = nodes
		.filter((n) => n.category === 'production' && n.isEntry)
		.map((n) => n.path)
		.slice(0, 25)

	const graphResult = {
		nodes,
		edges,
		externals,
		unresolvedImports,
		unresolvedCount: totalUnresolvedCount,
		unresolvedTruncated: isTruncated,
		summary: {
			entryPoints: productionEntryPoints,
			cycles,
			typeOnlyCycles,
			nonProduction: summaryNonProduction,
			orphans,
			hotspots: {
				byFanIn: sortedByFanIn,
				byTransitiveImpact: sortedByTransitiveImpact,
			},
			declaredButUnused,
			declaredButUnusedNote: NOTE_TEXT,
			usedButUndeclared,
			undeclaredSources,
			unresolvedAliases: allUnresolvedImports.filter((i) => i.reason === 'alias-unresolved').length,
			unresolvedByReason,
			unresolvedImports,
			unresolvedTruncated: isTruncated,
			unresolvedItems: {
				missingRelative: allUnresolvedImports.filter((i) => i.reason === 'relative-not-found' || i.reason === 'directory-index-not-found'),
				unresolvedAlias: allUnresolvedImports.filter((i) => i.reason === 'alias-unresolved'),
			},
			packages: summaryPackages,
			longestChain,
			unresolvedCount: totalUnresolvedCount,
			parsedFiles: nodes.length,
			configFiles,
		},
		coverage,
		graphFiles: nodes.length,
		truncated,
		graphNodesOmitted,
	}

	return graphResult
}

/**
 * Returns direct and transitive impact of fileId using reverse BFS.
 */
function getImpact(graph, fileId) {
	if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
		return { direct: [], transitive: [], percentOfRepo: 0 }
	}

	const cleanFileId = typeof fileId === 'string' ? fileId.replace(/^\.\//, '') : fileId
	let targetNode = null
	if (typeof fileId === 'number') {
		targetNode = graph.nodes.find((n) => n.id === fileId)
	} else if (typeof fileId === 'string') {
		targetNode = graph.nodes.find(
			(n) => n.path === fileId || n.path === cleanFileId || String(n.id) === fileId
		)
	}

	if (!targetNode) {
		return { direct: [], transitive: [], percentOfRepo: 0 }
	}

	// Incoming adjacency list: toId -> [fromId]
	const incoming = new Map()
	for (const [fromId, toId] of graph.edges) {
		if (!incoming.has(toId)) incoming.set(toId, [])
		incoming.get(toId).push(fromId)
	}

	const directIds = incoming.get(targetNode.id) || []
	const direct = directIds.map((id) => {
		const node = graph.nodes.find((n) => n.id === id)
		return node ? node.path : id
	})

	const transitiveSet = new Set()
	const queue = [...directIds]
	for (const id of directIds) transitiveSet.add(id)

	while (queue.length > 0) {
		const current = queue.shift()
		const parents = incoming.get(current) || []
		for (const parent of parents) {
			if (!transitiveSet.has(parent) && parent !== targetNode.id) {
				transitiveSet.add(parent)
				queue.push(parent)
			}
		}
	}

	const transitive = Array.from(transitiveSet).map((id) => {
		const node = graph.nodes.find((n) => n.id === id)
		return node ? node.path : id
	})

	const totalNodes = graph.nodes.length
	const percentOfRepo = totalNodes > 0
		? Number(((transitive.length / totalNodes) * 100).toFixed(1))
		: 0

	return {
		direct,
		transitive,
		percentOfRepo,
	}
}

const GRAPH_CACHE = new Map()
const GRAPH_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_GRAPH_CACHE_ENTRIES = 3

function getCachedGraph(owner, repo, ref) {
	const key = `${owner}/${repo}/${ref}`
	const item = GRAPH_CACHE.get(key)
	if (!item) return null
	if (Date.now() > item.expiresAt) {
		GRAPH_CACHE.delete(key)
		return null
	}
	return item.data
}

function setCachedGraph(owner, repo, ref, data, ttlMs = GRAPH_CACHE_TTL_MS) {
	const key = `${owner}/${repo}/${ref}`
	if (GRAPH_CACHE.has(key)) {
		GRAPH_CACHE.delete(key)
	} else if (GRAPH_CACHE.size >= MAX_GRAPH_CACHE_ENTRIES) {
		const oldestKey = GRAPH_CACHE.keys().next().value
		GRAPH_CACHE.delete(oldestKey)
	}
	GRAPH_CACHE.set(key, {
		data,
		expiresAt: Date.now() + ttlMs,
	})
}

function clearGraphCache() {
	GRAPH_CACHE.clear()
}

function getGraphCacheSize() {
	return GRAPH_CACHE.size
}

module.exports = {
	buildGraph,
	getImpact,
	getCachedGraph,
	setCachedGraph,
	clearGraphCache,
	getGraphCacheSize,
	GRAPH_CACHE_TTL_MS,
	MAX_GRAPH_CACHE_ENTRIES,
	extractImportSpecifiers,
	normalizeExternalPackageName,
	isConfigFile,
	isTestFile,
	isTestSetupFile,
	isDeclarationFile,
	isIgnoredToolingPackage,
	BIN_ALIASES,
	extractImports,
	isNonProductionFile,
	detectLanguage,
	isValidSpecifier,
	extractBundlerAliases,
	resolveFilePath,
	isRelativeSpecifier,
}

