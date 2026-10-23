const {
	extractProjectProfile,
	evaluateProjectRules,
} = require('./projectRules')
const {
	evaluateGithubHygieneSync,
	evaluateGithubHygiene,
} = require('./githubHygiene')
const {
	calculateDimensionsAndGrade,
} = require('./dimensions')
const path = require('path')
const {
	formatSnippet,
	extractExports,
	findLineAndSnippet,
	createRuleResult,
} = require('./ruleEngine')

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.html'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.json', '.d.ts', '.d.mts', '.d.cts']
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

const CONFIG_TOOLS = ['eslint', 'vite', 'tailwind', 'postcss', 'babel', 'jest', 'vitest', 'prettier', 'webpack', 'rollup']

const BIN_ALIASES = {
	tsc: 'typescript',
	ng: '@angular/cli',
	playwright: '@playwright/test',
}


function isCIFile(filePath) {
	if (!filePath) return false
	const clean = filePath.replace(/\\/g, '/').toLowerCase()
	return (
		clean.startsWith('.github/') ||
		clean.startsWith('.gitlab/') ||
		clean.startsWith('.circleci/') ||
		clean.startsWith('.azure-pipelines/') ||
		clean.includes('.gitlab-ci') ||
		clean.includes('circleci') ||
		clean.includes('.travis') ||
		clean.includes('azure-pipelines')
	)
}

const TOOL_PLUGIN_PRESETS = [
	{
		tools: ['eslint'],
		match: (name) => name.startsWith('eslint-plugin-') || name.startsWith('@eslint/') || name.startsWith('eslint-config-') || name.startsWith('@typescript-eslint/') || name === 'typescript-eslint',
	},
	{
		tools: ['babel', '@babel/core'],
		match: (name) => name.startsWith('babel-preset-') || name.startsWith('@babel/preset-') || name.startsWith('babel-plugin-') || name.startsWith('@babel/plugin-'),
	},
	{
		tools: ['vite'],
		match: (name) => name.startsWith('vite-plugin-') || name.startsWith('@vitejs/plugin-'),
	},
	{
		tools: ['postcss'],
		match: (name) => name.startsWith('postcss-') || name === 'autoprefixer',
	},
	{
		tools: ['tailwindcss', 'tailwind'],
		match: (name) => name.startsWith('@tailwindcss/'),
	},
	{
		tools: ['jest'],
		match: (name) => name.startsWith('jest-') || name === 'ts-jest' || name === 'babel-jest',
	},
	{
		tools: ['vitest'],
		match: (name) => name.startsWith('@vitest/'),
	},
	{
		tools: ['webpack'],
		match: (name) => name.startsWith('webpack-') || name.endsWith('-loader') || name.endsWith('-webpack-plugin'),
	},
	{
		tools: ['rollup'],
		match: (name) => name.startsWith('@rollup/plugin-') || name.startsWith('rollup-plugin-'),
	},
	{
		tools: ['prettier'],
		match: (name) => name.startsWith('prettier-plugin-') || name.startsWith('@prettier/'),
	},
]

function isKnownPluginOrPreset(depName, usedToolsSet) {
	if (!depName || !usedToolsSet) return false
	for (const entry of TOOL_PLUGIN_PRESETS) {
		const toolActive = entry.tools.some((t) => usedToolsSet.has(t))
		if (toolActive && entry.match(depName)) {
			return true
		}
	}
	return false
}

function isTypesPackageForUsed(depName, usedSet) {
	if (!depName || !depName.startsWith('@types/')) return false
	const base = depName.slice(7).replace('__', '/')
	if (base === 'node') return true
	return Boolean(usedSet && usedSet.has(base))
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

function isDeclarationFile(filePath, fileText = '') {
	if (!filePath) return false
	const lower = filePath.toLowerCase()
	if (lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts')) {
		return true
	}
	if (fileText && typeof fileText === 'string') {
		const stripped = fileText
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*/g, '')
			.trim()
		if (stripped) {
			const lines = stripped.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
			if (
				lines.length > 0 &&
				lines.every((line) =>
					/^(export\s+)?declare\s+/.test(line) ||
					/^(export\s+)?(type|interface)\s+/.test(line) ||
					/^import\s+type\s+/.test(line) ||
					/^[}{;]+$/.test(line)
				)
			) {
				return true
			}
		}
	}
	return false
}

function matchesVirtualModule(filePath, referencedVirtualModules) {
	if (!filePath || !referencedVirtualModules || referencedVirtualModules.size === 0) return false
	const cleanPath = filePath.replace(/\\/g, '/').toLowerCase()
	const ext = path.posix.extname(cleanPath)
	const baseNoExt = path.posix.basename(cleanPath, ext) // e.g. 'env'
	const dirName = path.posix.dirname(cleanPath)
	const parentDir = path.posix.basename(dirName) // e.g. 'client'
	const dirAndBase = `${parentDir}/${baseNoExt}` // e.g. 'client/env'

	for (const vm of referencedVirtualModules) {
		const cleanVm = vm.toLowerCase().replace(/^[\0/\\]+/, '').replace(/^virtual:/, '')
		const vmParts = cleanVm.split('/')
		const vmTail = vmParts[vmParts.length - 1] // e.g. 'env'

		if (
			cleanPath.endsWith(`/${cleanVm}${ext}`) ||
			cleanPath.endsWith(`/${cleanVm}`) ||
			cleanPath.endsWith(`/${dirAndBase}${ext}`) ||
			(cleanPath.endsWith(`/${baseNoExt}${ext}`) && vmTail === baseNoExt && (cleanVm.includes('vite') || cleanVm.includes('virtual') || cleanVm.startsWith('@'))) ||
			cleanVm === dirAndBase ||
			cleanVm.endsWith(`/${dirAndBase}`) ||
			cleanVm === baseNoExt
		) {
			return true
		}
	}
	return false
}

function isToolEntryCandidate(filePath) {
	if (!filePath) return false
	const clean = filePath.replace(/\\/g, '/')
	const parts = clean.split('/')
	return parts.includes('scripts') || parts.includes('bin')
}

function isKnownBuildOutput(specifier) {
	if (!specifier) return false
	const clean = specifier.replace(/\\/g, '/')
	return (
		clean === './dist' ||
		clean.startsWith('./dist/') ||
		clean === '../dist' ||
		clean.startsWith('../dist/') ||
		clean.startsWith('dist/') ||
		clean.includes('/dist/') ||
		clean === './build' ||
		clean.startsWith('./build/') ||
		clean === '../build' ||
		clean.startsWith('../build/') ||
		clean.startsWith('build/') ||
		clean.includes('/build/')
	)
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
			part === 'playgrounds' ||
			part === 'examples' ||
			part === 'example' ||
			part === 'test' ||
			part === 'tests' ||
			part === 'fixtures' ||
			part === 'fixture' ||
			part === '__fixtures__' ||
			part === 'e2e' ||
			part === 'docs'
		) {
			return true
		}
	}
	const base = path.posix.basename(clean).toLowerCase()
	if (
		base.includes('.spec.') ||
		base.includes('.test.') ||
		base.endsWith('.test.js') ||
		base.endsWith('.test.ts') ||
		base.endsWith('.test.jsx') ||
		base.endsWith('.test.tsx') ||
		base.endsWith('.test.mjs') ||
		base.endsWith('.test.cjs') ||
		base.endsWith('.spec.js') ||
		base.endsWith('.spec.ts') ||
		base.endsWith('.spec.jsx') ||
		base.endsWith('.spec.tsx') ||
		base.endsWith('_test.py') ||
		base.startsWith('test_') ||
		base === 'test.js' ||
		base === 'test.ts'
	) {
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
	// Drop import.meta, virtual: ids, pnpapi, @vite/* virtual modules, and ids starting with \0
	if (
		clean === 'import.meta' ||
		clean.startsWith('import.meta.') ||
		clean.startsWith('virtual:') ||
		clean === 'pnpapi' ||
		clean.startsWith('pnpapi/') ||
		clean === '@vite' ||
		clean.startsWith('@vite/') ||
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

	// 2. TypeScript .js / .jsx / .mjs / .cjs -> .ts / .tsx / .mts / .cts / .d.ts / .d.mts / .d.cts mapping
	if (cleanNorm.endsWith('.js')) {
		const asTs = cleanNorm.slice(0, -3) + '.ts'
		if (filesMap.has(asTs)) return asTs
		const asTsx = cleanNorm.slice(0, -3) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
		const asDts = cleanNorm.slice(0, -3) + '.d.ts'
		if (filesMap.has(asDts)) return asDts
	}
	if (cleanNorm.endsWith('.jsx')) {
		const asTsx = cleanNorm.slice(0, -4) + '.tsx'
		if (filesMap.has(asTsx)) return asTsx
		const asTs = cleanNorm.slice(0, -4) + '.ts'
		if (filesMap.has(asTs)) return asTs
		const asDts = cleanNorm.slice(0, -4) + '.d.ts'
		if (filesMap.has(asDts)) return asDts
	}
	if (cleanNorm.endsWith('.mjs')) {
		const asMts = cleanNorm.slice(0, -4) + '.mts'
		if (filesMap.has(asMts)) return asMts
		const asDmts = cleanNorm.slice(0, -4) + '.d.mts'
		if (filesMap.has(asDmts)) return asDmts
		const asDts = cleanNorm.slice(0, -4) + '.d.ts'
		if (filesMap.has(asDts)) return asDts
	}
	if (cleanNorm.endsWith('.cjs')) {
		const asCts = cleanNorm.slice(0, -4) + '.cts'
		if (filesMap.has(asCts)) return asCts
		const asDcts = cleanNorm.slice(0, -4) + '.d.cts'
		if (filesMap.has(asDcts)) return asDcts
		const asDts = cleanNorm.slice(0, -4) + '.d.ts'
		if (filesMap.has(asDts)) return asDts
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
 * Repository Health Score & Grade Formula
 *
 * One formula to derive unified score and grade from whole-repo production rules:
 *
 * 1. Base Score: 100 points.
 * 2. Deductions based on rule violations and severity:
 *    - 'critical' (runtime cycles, undeclared packages):
 *      Base deduction of 2.5 points for the first violation + 0.5 points per additional violation (max 8 points per rule).
 *    - 'important' (unresolved imports, orphan files, missing tests):
 *      Base deduction of 2.0 points for the first violation + 0.5 points per additional violation (max 5 points per rule).
 *    - 'nice-to-have' (unused dependencies, missing license, missing engines field):
 *      Base deduction of 1.0 point for the first violation + 0.1 points per additional violation (max 2 points per rule).
 *
 * 3. Raw Score & Grade:
 *    rawScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)))
 *    rawGrade = calculateGrade(rawScore):
 *      A: >= 90, B: >= 80, C: >= 70, D: >= 60, F: < 60
 *
 * 4. Grade Caps:
 *    Caps prevent a repository with real production problems from showing a high grade:
 *    - Any undeclared package or failed critical diagnostic -> max grade C (and score capped at max 79).
 *      capReason: `${count} undeclared ${count === 1 ? 'package' : 'packages'}` (or 'failed critical diagnostic').
 *    - Any runtime cycle -> max grade B (and score capped at max 89).
 *      capReason: `${count} runtime ${count === 1 ? 'cycle' : 'cycles'}`.
 *    - Truncated or failed Code Map scan -> max grade B (and score capped at max 89).
 *      capReason: truncated ? 'Code Map scan truncated' : 'Code Map scan failed'.
 *    - Otherwise: no cap, capReason is null.
 *
 * Returns { score, grade, capReason, rawScore, rawGrade }.
 */
function calculateScoreAndGrade(rules = [], options = {}) {
	const rulesMap = new Map()
	for (const r of rules) {
		if (r && r.id) rulesMap.set(r.id, r)
	}

	let totalDeductions = 0
	for (const rule of rules) {
		if (!rule || typeof rule.count !== 'number' || rule.count <= 0) continue

		if (rule.severity === 'critical') {
			const deduction = 2.5 + Math.min(5.5, (rule.count - 1) * 0.5)
			totalDeductions += deduction
		} else if (rule.severity === 'important') {
			const deduction = 2.0 + Math.min(3.0, (rule.count - 1) * 0.5)
			totalDeductions += deduction
		} else {
			// nice-to-have
			const deduction = 1.0 + Math.min(1.0, (rule.count - 1) * 0.1)
			totalDeductions += deduction
		}
	}

	const rawScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)))
	let rawGrade = 'F'
	if (rawScore >= 90) rawGrade = 'A'
	else if (rawScore >= 80) rawGrade = 'B'
	else if (rawScore >= 70) rawGrade = 'C'
	else if (rawScore >= 60) rawGrade = 'D'

	const undeclaredRule = rulesMap.get('undeclared-packages')
	const undeclaredCount = undeclaredRule ? undeclaredRule.count : 0

	const runtimeCyclesRule = rulesMap.get('runtime-cycles')
	const runtimeCyclesCount = runtimeCyclesRule ? runtimeCyclesRule.count : 0

	const hasFailedCriticalDiag = Boolean(options.hasFailedCriticalDiagnostic)
	const isTruncated = Boolean(options.truncated)
	const isFailedScan = Boolean(options.failed)

	let finalGrade = rawGrade
	let finalScore = rawScore
	let capReason = null

	if (undeclaredCount > 0 || hasFailedCriticalDiag) {
		// Cap at max Grade C
		if (finalGrade === 'A' || finalGrade === 'B' || finalGrade === 'C') {
			finalGrade = 'C'
			finalScore = Math.min(finalScore, 79)
			capReason = undeclaredCount > 0
				? `${undeclaredCount} undeclared ${undeclaredCount === 1 ? 'package' : 'packages'}`
				: 'failed critical diagnostic'
		}
	} else if (runtimeCyclesCount > 0) {
		// Cap at max Grade B
		if (finalGrade === 'A' || finalGrade === 'B') {
			finalGrade = 'B'
			finalScore = Math.min(finalScore, 89)
			capReason = `${runtimeCyclesCount} runtime ${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'}`
		}
	} else if (isTruncated || isFailedScan) {
		// Cap at max Grade B
		if (finalGrade === 'A' || finalGrade === 'B') {
			finalGrade = 'B'
			finalScore = Math.min(finalScore, 89)
			capReason = isTruncated ? 'Code Map scan truncated' : 'Code Map scan failed'
		}
	}

	return {
		score: finalScore,
		grade: finalGrade,
		capReason,
		rawScore,
		rawGrade,
	}
}

function computeProductionRules({
	cycles = [],
	orphans = [],
	usedButUndeclared = [],
	declaredButUnused = [],
	allUnresolvedImports = [],
	filesMap = new Map(),
	parsedPackageJsons = [],
	nodes = [],
	edges = [],
	packageImporters = new Map(),
	options = {},
}) {
	const prodUnresolvedImports = allUnresolvedImports.filter((item) => {
		if (item.category === 'non-production' || isNonProductionFile(item.from)) {
			return false
		}
		if (isKnownBuildOutput(item.specifier)) {
			return false
		}
		return true
	})

	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0]
	const nestedPackages = parsedPackageJsons
		.filter((p) => p.dir)
		.sort((a, b) => b.dir.length - a.dir.length)

	const getNearestPkg = (filePath) => {
		const clean = filePath.replace(/\\/g, '/')
		for (const pkgItem of nestedPackages) {
			if (clean === pkgItem.dir || clean.startsWith(pkgItem.dir + '/')) {
				return pkgItem
			}
		}
		return rootPkg
	}

	// 1. Runtime cycles
	const runtimeCyclesList = cycles.filter((c) => !c?.isTypeOnly)
	const runtimeCyclesExamples = runtimeCyclesList.slice(0, 3).map((cycle) => {
		const shortest = (Array.isArray(cycle.shortest) && cycle.shortest.length > 0)
			? cycle.shortest
			: (Array.isArray(cycle) ? cycle : (cycle.files || []))
		return (shortest.length > 1 && shortest[0] !== shortest[shortest.length - 1])
			? [...shortest, shortest[0]].join(' -> ')
			: shortest.join(' -> ')
	})
	function findClosingImportLine(fromFile, targetFile) {
		const fileText = filesMap.get(fromFile)?.text || ''
		if (!fileText) return { file: fromFile, line: 1, snippet: '' }
		const targetBase = path.posix.basename(targetFile, path.posix.extname(targetFile))
		const lines = fileText.split(/\r?\n/)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (
				(/\bimport\b|\brequire\b/.test(line)) &&
				(line.includes(targetBase) || line.includes(targetFile))
			) {
				return {
					file: fromFile,
					line: i + 1,
					snippet: formatSnippet(line, 120),
				}
			}
		}
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (
				(/\bfrom\s*['"][^'"]*['"]/.test(line) || /require\s*\(['"][^'"]*['"]\)/.test(line)) &&
				(line.includes(targetBase) || line.includes(targetFile))
			) {
				return {
					file: fromFile,
					line: i + 1,
					snippet: formatSnippet(line, 120),
				}
			}
		}
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(targetBase)) {
				return {
					file: fromFile,
					line: i + 1,
					snippet: formatSnippet(lines[i], 120),
				}
			}
		}
		return { file: fromFile, line: 1, snippet: formatSnippet(lines[0] || targetBase, 120) }
	}

	const cycleEvidence = []
	for (const cycle of runtimeCyclesList.slice(0, 3)) {
		const shortest = (Array.isArray(cycle.shortest) && cycle.shortest.length > 0)
			? cycle.shortest
			: (Array.isArray(cycle) ? cycle : (cycle.files || []))
		const lastNode = shortest[shortest.length - 1] || shortest[0]
		const firstNode = shortest[0] || lastNode
		let ev = findClosingImportLine(lastNode, firstNode)
		if (ev.line === 1 && shortest.length > 1) {
			const alt = findClosingImportLine(firstNode, shortest[1])
			if (alt.line !== 1) ev = alt
		}
		cycleEvidence.push(ev)
	}
	const firstCycleShortest = runtimeCyclesList[0]?.shortest || runtimeCyclesList[0]?.files || []
	const cycleWhy = runtimeCyclesList.length > 0
		? `The production file "${firstCycleShortest[0] || 'file'}" forms a circular dependency loop with "${firstCycleShortest[1] || 'dependency'}".`
		: 'No circular dependencies detected in production code.'
	const cycleFix = runtimeCyclesList.length > 0
		? `Refactor "${firstCycleShortest[0] || 'file'}" or extract shared logic into a separate module to break the cycle.`
		: 'No action required.'

	const runtimeCyclesRule = createRuleResult({
		id: 'runtime-cycles',
		name: 'Runtime Circular Dependency',
		severity: 'critical',
		dimension: 'reliability',
		why: cycleWhy,
		fix: cycleFix,
		docsUrl: 'https://nodejs.org/api/modules.html#cycles',
		evidence: cycleEvidence,
		count: runtimeCyclesList.length,
		examples: runtimeCyclesExamples,
		affectedExamples: runtimeCyclesExamples,
	})

	// 2. Orphans (with root-cause grouping)
	const prodNodes = nodes.filter((n) => n.category === 'production' && !isNonProductionFile(n.path))
	
	const orphanChildren = []
	const orphanEvidence = []
	for (const orphanPath of orphans) {
		const fileText = filesMap.get(orphanPath)?.text || ''
		const fileExports = extractExports(fileText)
		
		const importedSpecifiers = extractImportSpecifiers(fileText)
		const importedPkgs = new Set()
		for (const spec of importedSpecifiers) {
			if (!isRelativeSpecifier(spec) && !spec.startsWith('/') && !spec.startsWith('~') && !spec.startsWith('#') && isValidSpecifier(spec)) {
				const norm = normalizeExternalPackageName(spec)
				if (norm && !isNodeBuiltin(norm)) {
					importedPkgs.add(norm)
				}
			}
		}

		const exclusiveDeps = []
		for (const pkg of importedPkgs) {
			let usedElsewhere = false
			for (const otherNode of prodNodes) {
				if (otherNode.path === orphanPath) continue
				const otherText = filesMap.get(otherNode.path)?.text || ''
				if (otherText.includes(pkg)) {
					usedElsewhere = true
					break
				}
			}
			if (!usedElsewhere) {
				exclusiveDeps.push(pkg)
			}
		}

		orphanChildren.push({
			file: orphanPath,
			exportsCount: fileExports.length,
			dependenciesCount: exclusiveDeps.length,
			exports: fileExports,
			dependencies: exclusiveDeps,
			summary: `1 unused file explains ${fileExports.length} ${fileExports.length === 1 ? 'export' : 'exports'} and ${exclusiveDeps.length} ${exclusiveDeps.length === 1 ? 'dependency' : 'dependencies'}`,
		})

		if (orphanEvidence.length < 3) {
			const firstLine = fileText.split(/\r?\n/)[0] || orphanPath
			orphanEvidence.push({
				file: orphanPath,
				line: 1,
				snippet: formatSnippet(firstLine, 120),
			})
		}
	}

	const firstChild = orphanChildren[0]
	const orphanWhy = orphans.length > 0
		? (firstChild ? `The production file "${orphans[0]}" is unused (${firstChild.summary}).` : `The production file "${orphans[0]}" is not imported anywhere in the project.`)
		: 'All production files are imported and utilized.'
	const orphanFix = orphans.length > 0
		? `Import "${orphans[0]}" where needed or safely remove it and its unused dependencies.`
		: 'No action required.'

	const orphansRule = createRuleResult({
		id: 'orphans',
		name: 'Unused Production File',
		severity: 'important',
		dimension: 'maintainability',
		why: orphanWhy,
		fix: orphanFix,
		docsUrl: 'https://docs.npmjs.com/creating-node-js-modules',
		evidence: orphanEvidence,
		count: orphans.length,
		children: orphanChildren,
		examples: orphans.slice(0, 3),
		affectedExamples: orphans.slice(0, 3),
	})

	// 3. Undeclared packages
	const undeclaredEvidence = []
	for (const pkg of usedButUndeclared.slice(0, 3)) {
		const importers = Array.from(packageImporters.get(pkg) || [])
		const file = importers[0] || 'src'
		const info = findLineAndSnippet(filesMap.get(file)?.text, pkg)
		undeclaredEvidence.push({ file, line: info.line, snippet: info.snippet })
	}
	const undeclaredWhy = usedButUndeclared.length > 0
		? `Production file "${undeclaredEvidence[0]?.file || 'src'}" imports package "${usedButUndeclared[0]}", which is not declared in package.json.`
		: 'All imported packages are declared in package.json.'
	const undeclaredFix = usedButUndeclared.length > 0
		? `Run \`npm install ${usedButUndeclared[0]}\` to add it to package.json dependencies.`
		: 'No action required.'

	const undeclaredRule = createRuleResult({
		id: 'undeclared-packages',
		name: 'Undeclared Package Dependency',
		severity: 'critical',
		dimension: 'reliability',
		why: undeclaredWhy,
		fix: undeclaredFix,
		docsUrl: 'https://docs.npmjs.com/specifying-dependencies',
		evidence: undeclaredEvidence,
		count: usedButUndeclared.length,
		examples: usedButUndeclared.slice(0, 3),
		affectedExamples: usedButUndeclared.slice(0, 3),
	})

	// 4. Production code importing devDependencies
	function isBundledPackage(pkgItem) {
		if (!pkgItem) return false
		const content = pkgItem.content || {}
		const scripts = content.scripts || {}
		const deps = { ...(content.dependencies || {}), ...(content.devDependencies || {}) }

		const BUNDLER_PATTERNS = [/\btsdown\b/i, /\brolldown\b/i, /\besbuild\b/i, /\bwebpack\b/i, /\brollup\b/i, /\bvite\s+build\b/i]
		for (const sVal of Object.values(scripts)) {
			if (typeof sVal === 'string' && BUNDLER_PATTERNS.some((pat) => pat.test(sVal))) {
				return true
			}
		}
		const BUNDLER_PACKAGES = ['tsdown', 'rolldown', 'esbuild', 'webpack', 'rollup', 'vite']
		for (const bp of BUNDLER_PACKAGES) {
			if (deps[bp]) return true
		}
		const pkgDir = pkgItem.dir ? `${pkgItem.dir}/` : ''
		const CONFIG_PATTERNS = [
			/^vite\.config\.[mc]?[jt]s$/,
			/^rollup\.config\.[mc]?[jt]s$/,
			/^webpack\.config\.[mc]?[jt]s$/,
			/^esbuild\.[mc]?[jt]s$/,
			/^tsdown\.config\.[mc]?[jt]s$/,
			/^rolldown\.config\.[mc]?[jt]s$/,
		]
		for (const filePath of filesMap.keys()) {
			if (pkgDir && !filePath.startsWith(pkgDir)) continue
			const relPath = pkgDir ? filePath.slice(pkgDir.length) : filePath
			if (CONFIG_PATTERNS.some((pat) => pat.test(relPath))) {
				return true
			}
		}
		return false
	}

	const devDepFindings = []
	const devDepPackages = new Set()
	for (const node of prodNodes) {
		if (node.isConfig || isConfigFile(node.path)) continue
		const pkgItem = getNearestPkg(node.path)
		// Skip dev-dependency-in-production for packages bundled by a build tool
		if (isBundledPackage(pkgItem)) continue

		const devDeps = pkgItem?.content?.devDependencies || {}
		const prodDeps = pkgItem?.content?.dependencies || {}
		const rootProdDeps = rootPkg?.content?.dependencies || {}

		const fileText = filesMap.get(node.path)?.text || ''
		const detailedImports = extractImports(fileText)
		for (const imp of detailedImports) {
			if (imp.typeOnly) continue
			const spec = imp.specifier
			if (!isRelativeSpecifier(spec) && !spec.startsWith('/') && !spec.startsWith('~') && !spec.startsWith('#') && isValidSpecifier(spec)) {
				const norm = normalizeExternalPackageName(spec)
				if (norm && !isNodeBuiltin(norm) && devDeps[norm] && !prodDeps[norm] && !rootProdDeps[norm]) {
					const info = findLineAndSnippet(fileText, spec)
					const finding = {
						file: node.path,
						pkg: norm,
						line: info.line,
						snippet: info.snippet,
						pkgPath: pkgItem?.path || 'package.json',
					}
					devDepFindings.push(finding)
					devDepPackages.add(finding.pkgPath)
				}
			}
		}
	}
	const devDepEvidence = devDepFindings.slice(0, 3).map((f) => ({
		file: f.file,
		line: f.line,
		snippet: f.snippet,
	}))
	const devDepWhy = devDepFindings.length > 0
		? `Production file "${devDepFindings[0].file}" imports package "${devDepFindings[0].pkg}", which is declared in devDependencies.`
		: 'No devDependencies are imported by production code.'
	const devDepFix = devDepFindings.length > 0
		? `Move "${devDepFindings[0].pkg}" from devDependencies to dependencies in ${devDepFindings[0].pkgPath}.`
		: 'No action required.'

	const devDepRule = createRuleResult({
		id: 'dev-dependency-in-production',
		name: 'Production Code Importing DevDependency',
		severity: 'important',
		dimension: 'reliability',
		why: devDepWhy,
		fix: devDepFix,
		docsUrl: 'https://docs.npmjs.com/specifying-dependencies',
		evidence: devDepEvidence,
		count: devDepPackages.size,
		examples: devDepFindings.slice(0, 3).map((f) => `${f.pkg} in ${f.file}`),
		affectedExamples: devDepFindings.slice(0, 3).map((f) => `${f.pkg} in ${f.file}`),
	})

	// 5. Package in both dependencies and devDependencies
	const dupFindings = []
	for (const pkgItem of parsedPackageJsons) {
		const deps = pkgItem.content?.dependencies || {}
		const devDeps = pkgItem.content?.devDependencies || {}
		for (const key of Object.keys(deps)) {
			if (Object.prototype.hasOwnProperty.call(devDeps, key)) {
				const info = findLineAndSnippet(filesMap.get(pkgItem.path)?.text, key)
				dupFindings.push({
					file: pkgItem.path,
					pkg: key,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}
	}
	const dupEvidence = dupFindings.slice(0, 3).map((d) => ({
		file: d.file,
		line: d.line,
		snippet: d.snippet,
	}))
	const dupWhy = dupFindings.length > 0
		? `Package "${dupFindings[0].pkg}" is declared in both dependencies and devDependencies in ${dupFindings[0].file}.`
		: 'No package is duplicated between dependencies and devDependencies.'
	const dupFix = dupFindings.length > 0
		? `Remove "${dupFindings[0].pkg}" from devDependencies in ${dupFindings[0].file}.`
		: 'No action required.'

	const duplicateDepsRule = createRuleResult({
		id: 'duplicate-dependencies',
		name: 'Duplicate Dependency Declaration',
		severity: 'important',
		dimension: 'hygiene',
		why: dupWhy,
		fix: dupFix,
		docsUrl: 'https://docs.npmjs.com/specifying-dependencies',
		evidence: dupEvidence,
		count: dupFindings.length,
		examples: dupFindings.slice(0, 3).map((d) => `${d.pkg} in ${d.file}`),
		affectedExamples: dupFindings.slice(0, 3).map((d) => `${d.pkg} in ${d.file}`),
	})

	// 6. Unresolved imports (production, excluding known build outputs like ./dist)
	const unresolvedEvidence = []
	for (const item of prodUnresolvedImports.slice(0, 3)) {
		const info = findLineAndSnippet(filesMap.get(item.from)?.text, item.specifier)
		unresolvedEvidence.push({
			file: item.from,
			line: info.line,
			snippet: info.snippet,
		})
	}
	const unresolvedWhy = prodUnresolvedImports.length > 0
		? `Production file "${prodUnresolvedImports[0].from}" imports "${prodUnresolvedImports[0].specifier}", which cannot be resolved.`
		: 'All relative and alias imports resolve to valid files.'
	const unresolvedFix = prodUnresolvedImports.length > 0
		? `Verify the import path "${prodUnresolvedImports[0].specifier}" in "${prodUnresolvedImports[0].from}" or create the missing file.`
		: 'No action required.'

	const unresolvedRule = createRuleResult({
		id: 'unresolved-imports',
		name: 'Unresolved Import',
		severity: 'important',
		dimension: 'reliability',
		why: unresolvedWhy,
		fix: unresolvedFix,
		docsUrl: 'https://nodejs.org/api/modules.html#all-together',
		evidence: unresolvedEvidence,
		count: prodUnresolvedImports.length,
		examples: prodUnresolvedImports.slice(0, 3).map((item) => `${item.specifier} in ${item.from}`),
		affectedExamples: prodUnresolvedImports.slice(0, 3).map((item) => `${item.specifier} in ${item.from}`),
	})

	// 7. Unused dependencies
	const unusedDepsEvidence = []
	for (const dep of declaredButUnused.slice(0, 3)) {
		let declaringPkg = parsedPackageJsons.find((pkg) => {
			const deps = pkg.content?.dependencies || {}
			const devDeps = pkg.content?.devDependencies || {}
			return Object.prototype.hasOwnProperty.call(deps, dep) || Object.prototype.hasOwnProperty.call(devDeps, dep)
		}) || rootPkg
		const pkgPath = declaringPkg?.path || 'package.json'
		const pkgText = filesMap.get(pkgPath)?.text || ''
		const info = findLineAndSnippet(pkgText, `"${dep}"`)
		unusedDepsEvidence.push({
			file: pkgPath,
			line: info.line,
			snippet: info.snippet,
		})
	}
	const unusedWhy = declaredButUnused.length > 0
		? `Package "${declaredButUnused[0]}" is declared in package.json but never used in code, scripts, or configuration.`
		: 'All declared dependencies are used in the project.'
	const unusedFix = declaredButUnused.length > 0
		? `Run \`npm uninstall ${declaredButUnused[0]}\` to remove the unused package.`
		: 'No action required.'

	const unusedDepsRule = createRuleResult({
		id: 'unused-dependencies',
		name: 'Unused Dependency',
		severity: 'nice-to-have',
		dimension: 'hygiene',
		why: unusedWhy,
		fix: unusedFix,
		docsUrl: 'https://docs.npmjs.com/cli/v10/commands/npm-uninstall',
		evidence: unusedDepsEvidence,
		count: declaredButUnused.length,
		examples: declaredButUnused.slice(0, 3),
		affectedExamples: declaredButUnused.slice(0, 3),
	})

	// 8. Missing license
	const hasLicenseFile = Array.from(filesMap.keys()).some((p) => {
		const base = path.posix.basename(p).toLowerCase()
		return (
			base === 'license' ||
			base === 'licence' ||
			base.startsWith('license.') ||
			base.startsWith('licence.') ||
			base.startsWith('license-') ||
			base.startsWith('licence-')
		)
	})
	const hasLicenseField = Boolean(
		rootPkg?.content?.license &&
		typeof rootPkg.content.license === 'string' &&
		rootPkg.content.license.trim()
	)
	const hasLicense = hasLicenseFile || hasLicenseField
	const missingLicenseCount = hasLicense ? 0 : 1

	const missingLicenseRule = createRuleResult({
		id: 'missing-license',
		name: 'Missing License',
		severity: 'nice-to-have',
		dimension: 'hygiene',
		why: missingLicenseCount > 0 ? 'No LICENSE file or package.json license field was found in the repository.' : 'Repository includes an open source license.',
		fix: missingLicenseCount > 0 ? 'Add a LICENSE file (e.g. MIT, Apache-2.0) to the repository root.' : 'No action required.',
		docsUrl: 'https://choosealicense.com/',
		evidence: missingLicenseCount > 0 ? [{ file: 'package.json', line: 1, snippet: 'Missing license declaration' }] : [],
		count: missingLicenseCount,
		examples: hasLicense ? [] : ['LICENSE'],
		affectedExamples: hasLicense ? [] : ['LICENSE'],
	})

	// 9. Missing engines field
	const hasEnginesField = Boolean(
		rootPkg?.content?.engines &&
		typeof rootPkg.content.engines === 'object' &&
		Object.keys(rootPkg.content.engines).length > 0
	)
	const missingEnginesCount = hasEnginesField ? 0 : 1

	const missingEnginesRule = createRuleResult({
		id: 'missing-engines-field',
		name: 'Missing Node Engine Specification',
		severity: 'nice-to-have',
		dimension: 'hygiene',
		why: missingEnginesCount > 0 ? 'package.json does not specify supported Node.js versions in an engines field.' : 'package.json specifies an engines field.',
		fix: missingEnginesCount > 0 ? 'Add an "engines": { "node": ">=18.0.0" } field to package.json.' : 'No action required.',
		docsUrl: 'https://docs.npmjs.com/cli/v10/configuring-npm/package-json#engines',
		evidence: missingEnginesCount > 0 ? [{ file: 'package.json', line: 1, snippet: 'Missing engines.node field' }] : [],
		count: missingEnginesCount,
		examples: hasEnginesField ? [] : ['package.json engines field'],
		affectedExamples: hasEnginesField ? [] : ['package.json engines field'],
	})

	// 10. Missing tests
	const hasTestScript = parsedPackageJsons.some((p) => {
		const testScript = p.content?.scripts?.test
		return (
			typeof testScript === 'string' &&
			testScript.trim() !== '' &&
			!testScript.includes('no test specified')
		)
	})
	const hasTestFiles = Array.from(filesMap.keys()).some((p) => isTestFile(p))
	const hasTests = hasTestScript || hasTestFiles
	const missingTestsCount = hasTests ? 0 : 1

	const missingTestsRule = createRuleResult({
		id: 'missing-tests',
		name: 'Missing Test Script or Test Files',
		severity: 'important',
		dimension: 'maintainability',
		why: missingTestsCount > 0 ? 'No test script or test files were found in this project.' : 'Test suite or test script is configured.',
		fix: missingTestsCount > 0 ? 'Add a "test" script to package.json and write automated unit tests.' : 'No action required.',
		docsUrl: 'https://docs.npmjs.com/cli/v10/using-npm/scripts',
		evidence: missingTestsCount > 0 ? [{ file: 'package.json', line: 1, snippet: 'Missing "test" script' }] : [],
		count: missingTestsCount,
		examples: hasTests ? [] : ['No test files or test script found'],
		affectedExamples: hasTests ? [] : ['No test files or test script found'],
	})

	const baseRules = [
		runtimeCyclesRule,
		orphansRule,
		undeclaredRule,
		unresolvedRule,
		unusedDepsRule,
		missingLicenseRule,
		missingEnginesRule,
		missingTestsRule,
	]

	const profile = extractProjectProfile({
		filesMap,
		parsedPackageJsons,
		nodes,
		isNonProductionFile,
	})

	const projectRuleFindings = evaluateProjectRules({
		filesMap,
		parsedPackageJsons,
		nodes,
		profile,
		isNonProductionFile,
		options,
	})

	const githubRuleFindings = options.githubFindings || evaluateGithubHygieneSync({
		filesMap,
	})

	const extraRules = [
		devDepRule,
		duplicateDepsRule,
		...projectRuleFindings,
		...githubRuleFindings,
	]

	const allRules = [...baseRules, ...extraRules]
	const rules = [...baseRules]

	const origFind = rules.find.bind(rules)
	rules.find = (fn) => origFind(fn) || allRules.find(fn)
	rules.allRules = allRules
	rules.profile = profile
	rules.extraRules = extraRules

	return rules
}

function buildGraph(files, packageJsons = [], options = {}) {
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
	const prodRuntimeExternalsAll = new Set()
	const packageImporters = new Map() // normName -> Set<filePath>
	const pkgPackageImporters = new Map() // dir -> Map(normName -> Set<filePath>)
	const pkgProdExternals = new Map() // dir -> Set of external pkg names
	const pkgProdRuntimeExternals = new Map() // dir -> Set of external pkg names used at runtime
	for (const pkgItem of parsedPackageJsons) {
		pkgProdExternals.set(pkgItem.dir, new Set())
		pkgProdRuntimeExternals.set(pkgItem.dir, new Set())
		pkgPackageImporters.set(pkgItem.dir, new Map())
	}

	const allUnresolvedImports = []

	const referencedVirtualModules = new Set()
	for (const [fPath, fData] of filesMap.entries()) {
		if (!fData || !fData.text) continue
		const source = fPath.endsWith('.vue') ? extractVueScript(fData.text) : fData.text
		const entries = extractImports(source)
		for (const { specifier } of entries) {
			if (
				specifier.startsWith('virtual:') ||
				specifier.startsWith('@vite/') ||
				specifier.startsWith('/@vite/') ||
				specifier.startsWith('\0') ||
				specifier.startsWith('\\0')
			) {
				referencedVirtualModules.add(specifier)
			}
		}
		const vmMatches = source.match(/['"](@vite\/[a-zA-Z0-9_-]+|\/@vite\/[a-zA-Z0-9_-]+|virtual:[a-zA-Z0-9_/-]+)['"]/g) || []
		for (const m of vmMatches) {
			referencedVirtualModules.add(m.slice(1, -1))
		}
	}

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
						// Type-only imports and .d.ts files count as USAGE (a package used only via import type is not "declared but unused")
						prodExternalsAll.add(normName)
						if (nearestPkg && pkgProdExternals.has(nearestPkg.dir)) {
							pkgProdExternals.get(nearestPkg.dir).add(normName)
						}

						// But they never produce usedButUndeclared entries
						const isTypeContext = Boolean(typeOnly || isDeclarationFile(node.path, fileData.text))
						if (!isTypeContext) {
							prodRuntimeExternalsAll.add(normName)
							if (nearestPkg && pkgProdRuntimeExternals.has(nearestPkg.dir)) {
								pkgProdRuntimeExternals.get(nearestPkg.dir).add(normName)
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
		const fileText = filesMap.get(node.path)?.text || ''
		const isSpecial =
			node.isEntry ||
			node.isConfig ||
			node.isTest ||
			isToolEntryCandidate(node.path) ||
			isConfigFile(node.path) ||
			isTestFile(node.path) ||
			isTestSetupFile(node.path) ||
			isDeclarationFile(node.path, fileText) ||
			matchesVirtualModule(node.path, referencedVirtualModules)

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
			!isDeclarationFile(n.path, filesMap.get(n.path)?.text) &&
			!matchesVirtualModule(n.path, referencedVirtualModules)
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
			if ((isConfigFile(filePath) || isCIFile(filePath)) && fileData.text) {
				const nearest = getNearestPackage(filePath)
				if (!nearest || nearest.dir === pkgItem.dir || !pkgItem.dir) {
					const text = fileData.text
					for (const dep of allDeclaredDependencies) {
						if (refSet.has(dep)) continue
						const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
						const quotedRegex = new RegExp(`['"\`]${escaped}(?:/[^'"\`]*)?['"\`]`)
						const keyRegex = new RegExp('(^|[\\s{,])' + escaped + '\\s*:')
						const isCI = isCIFile(filePath)
						const wordRegex = new RegExp('(^|[\\s/.:;,-])' + escaped + '([\\s/.:;,-]|$)')
						if (quotedRegex.test(text) || keyRegex.test(text) || (isCI && wordRegex.test(text))) {
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
		const pkgAllUsed = new Set([...pkgUsedInProd, ...pkgRefs, ...allReferencedInScriptsOrConfigs])
		for (const dep of pkgDeclared) {
			const isUsedType = isTypesPackageForUsed(dep, pkgAllUsed)
			const isUsedPlugin = isKnownPluginOrPreset(dep, pkgAllUsed)
			if (
				!pkgUsedInProd.has(dep) &&
				!isNodeBuiltin(dep) &&
				!workspacePackages.has(dep) &&
				!localPackageNames.has(dep) &&
				!allFilteredLocalOrProtocolDeps.has(dep) &&
				!isUsedType &&
				!isUsedPlugin &&
				!pkgRefs.has(dep)
			) {
				pkgDeclaredButUnused.push(dep)
			}
		}

		const pkgRuntimeExternals = pkgProdRuntimeExternals.get(pkgItem.dir) || new Set()
		const pkgUsedButUndeclared = []
		for (const dep of pkgRuntimeExternals) {
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
	const allUsedAggregate = new Set([...prodExternalsAll, ...allReferencedInScriptsOrConfigs])
	for (const dep of allDeclaredDependencies) {
		const isUsedType = isTypesPackageForUsed(dep, allUsedAggregate)
		const isUsedPlugin = isKnownPluginOrPreset(dep, allUsedAggregate)
		if (
			!prodExternalsAll.has(dep) &&
			!isNodeBuiltin(dep) &&
			!workspacePackages.has(dep) &&
			!localPackageNames.has(dep) &&
			!allFilteredLocalOrProtocolDeps.has(dep) &&
			!isUsedType &&
			!isUsedPlugin &&
			!allReferencedInScriptsOrConfigs.has(dep)
		) {
			declaredButUnused.push(dep)
		}
	}

	const usedButUndeclared = []
	for (const name of prodRuntimeExternalsAll) {
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

	const rules = computeProductionRules({
		cycles,
		orphans,
		usedButUndeclared,
		declaredButUnused,
		allUnresolvedImports,
		filesMap,
		parsedPackageJsons,
		nodes,
		edges,
		packageImporters,
		options,
	})

	const isTruncatedScan = Boolean(truncated || options.truncated)
	const dimensionsAndGrade = calculateDimensionsAndGrade(rules.allRules, {
		truncated: isTruncatedScan,
		failed: Boolean(options.failed),
		hasFailedCriticalDiagnostic: Boolean(options.hasFailedCriticalDiagnostic),
	})

	const scoreAndGrade = {
		score: dimensionsAndGrade.score,
		grade: dimensionsAndGrade.grade,
		capReason: dimensionsAndGrade.capReason,
	}

	let changes = null
	if (options.owner && options.repo) {
		const prev = getPreviousScan(options.owner, options.repo)
		changes = computeChanges(prev, {
			summary: {
				allRules: rules.allRules,
				rules,
				dimensions: dimensionsAndGrade.dimensions,
			},
			dimensions: dimensionsAndGrade.dimensions,
		})
	}

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
			rules,
			allRules: rules.allRules,
			findings: rules.allRules.filter((r) => r.count > 0),
			profile: rules.profile,
			dimensions: dimensionsAndGrade.dimensions,
			changes,
			score: scoreAndGrade.score,
			grade: scoreAndGrade.grade,
			capReason: scoreAndGrade.capReason,
		},
		dimensions: dimensionsAndGrade.dimensions,
		profile: rules.profile,
		changes,
		coverage,
		graphFiles: nodes.length,
		truncated,
		graphNodesOmitted,
		score: scoreAndGrade.score,
		grade: scoreAndGrade.grade,
		capReason: scoreAndGrade.capReason,
	}

	if (options.owner && options.repo) {
		setPreviousScan(options.owner, options.repo, graphResult)
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

const PREVIOUS_SCANS = new Map()

function getPreviousScan(owner, repo) {
	if (!owner || !repo) return null
	const key = `${owner}/${repo}`.toLowerCase()
	return PREVIOUS_SCANS.get(key) || null
}

function setPreviousScan(owner, repo, data) {
	if (!owner || !repo) return
	const key = `${owner}/${repo}`.toLowerCase()
	PREVIOUS_SCANS.set(key, data)
}

function clearPreviousScans() {
	PREVIOUS_SCANS.clear()
}

function computeChanges(previousScan, currentScan) {
	if (!previousScan || !currentScan) return null

	const prevRules = previousScan.summary?.allRules || previousScan.summary?.rules || []
	const currRules = currentScan.summary?.allRules || currentScan.summary?.rules || []

	const prevMap = new Map()
	for (const r of prevRules) {
		if (r && r.count > 0) prevMap.set(r.id, r)
	}

	const currMap = new Map()
	for (const r of currRules) {
		if (r && r.count > 0) currMap.set(r.id, r)
	}

	const newFindings = []
	for (const [id, r] of currMap.entries()) {
		if (!prevMap.has(id)) {
			newFindings.push(r)
		}
	}

	const fixedFindings = []
	for (const [id, r] of prevMap.entries()) {
		if (!currMap.has(id)) {
			fixedFindings.push(r)
		}
	}

	const GRADE_VAL = { A: 4, B: 3, C: 2, D: 1, E: 0 }
	const dimensionChange = {}
	const prevDims = previousScan.summary?.dimensions || previousScan.dimensions || {}
	const currDims = currentScan.summary?.dimensions || currentScan.dimensions || {}

	for (const dim of ['security', 'reliability', 'maintainability', 'hygiene']) {
		const curG = currDims[dim]?.grade || 'A'
		const prevG = prevDims[dim]?.grade || 'A'
		const diff = (GRADE_VAL[curG] ?? 0) - (GRADE_VAL[prevG] ?? 0)
		dimensionChange[dim] = diff > 0 ? `+${diff}` : `${diff}`
	}

	return {
		newFindings,
		fixedFindings,
		dimensionChange,
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

function getCachedGraphCaseInsensitive(owner, repo) {
	if (!owner || !repo) return null
	const target = `${owner}/${repo}`.toLowerCase()
	for (const [key, item] of GRAPH_CACHE.entries()) {
		const parts = key.split('/')
		if (parts.length >= 2) {
			const candidate = `${parts[0]}/${parts[1]}`.toLowerCase()
			if (candidate === target) {
				if (item && Date.now() <= item.expiresAt) {
					return item.data
				}
			}
		}
	}
	return null
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
	getCachedGraphCaseInsensitive,
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
	matchesVirtualModule,
	isIgnoredToolingPackage,
	BIN_ALIASES,
	extractImports,
	isNonProductionFile,
	detectLanguage,
	isValidSpecifier,
	extractBundlerAliases,
	resolveFilePath,
	isRelativeSpecifier,
	isKnownBuildOutput,
	calculateScoreAndGrade,
	computeProductionRules,
	getPreviousScan,
	setPreviousScan,
	clearPreviousScans,
	computeChanges,
}

