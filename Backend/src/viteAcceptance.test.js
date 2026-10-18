const assert = require('node:assert/strict')
const test = require('node:test')
const {
	buildGraph,
	extractImportSpecifiers,
	extractImports,
	isValidSpecifier,
	isNonProductionFile,
	detectLanguage,
	resolveFilePath,
} = require('./services/graph')

// 1. Specifier extraction
test('specifier extraction: ignores template literals with nested ${}, regex literals, and non-import strings', () => {
	const code = `
		// String with fake import
		const str = "import fake1 from 'fake-string-pkg'";

		// Regex literal containing import syntax
		const regex = /import\\s+.*?from\\s+['"]fake-regex-pkg['"]/;
		const regexWithClass = /[/]import from 'fake-class'/;

		// Division operator that must not be confused with regex
		const quotient = 100 / 2 / 5;

		// Template literal with nested interpolations and fake imports in string parts
		const tmpl = \`
			import fakeTmpl1 from 'fake-tmpl-1';
			\${ "nested string with import fakeTmpl2 from 'fake-tmpl-2'" }
			\${ \`inner template with \${ 1 + 2 } import fakeTmpl3 from 'fake-tmpl-3'\` }
			text after
		\`;

		// Real static imports
		import real1 from './real1';
		import { real2 } from 'real-pkg';
		const real3 = require('./real3');
		export { real4 } from './real4';
	`

	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers.sort(), ['./real1', './real3', './real4', 'real-pkg'].sort())
})

test('specifier extraction regression: packages/create-vite/src/index.ts template literals do not extract fake imports', () => {
	const code = `
		// renovate: datasource=npm depName=eslint
		const eslintVersion = '10.12.0'
		const eslintPluginReactHooksVersion = '7.1.1'
		const globalsVersion = '17.13.0'

		const eslintConfigForTS = /* js */ \`import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
\`

		const eslintReactConfig = /* js */ \`// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'
\`

		devDepsEntries.push(
			['eslint', \`^\${eslintVersion}\`],
			['eslint-plugin-react-hooks', \`^\${eslintPluginReactHooksVersion}\`],
			['globals', \`^\${globalsVersion}\`]
		)

		import realModule from './realModule.js'
	`
	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers, ['./realModule.js'])
})

test('specifier extraction: dynamic import(literal) accepted, non-literal ignored, invalid specifiers dropped', () => {
	const code = `
		// Valid dynamic literal imports
		const dyn1 = import('./dyn1');
		const dyn2 = import("dyn-pkg");
		const dyn3 = import('./dyn3', { with: { type: 'json' } });

		// Non-literal dynamic imports (MUST BE IGNORED)
		const dynVar = import(someVar);
		const dynConcat = import('./path/' + file);
		const dynTmpl = import(\`./path/\${file}\`);

		// Invalid specifiers (spaces, newlines, parens, backslashes, import.meta, virtual:, \\0)
		import bad1 from 'bad specifier with spaces';
		import bad2 from 'bad(parens)';
		import bad3 from 'bad\\\\backslash';
		import bad4 from 'virtual:pwa-register';
		import bad5 from '\\0rollupPluginBabelHelpers';
		import.meta.url;
	`

	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers.sort(), ['./dyn1', './dyn3', 'dyn-pkg'].sort())

	assert.equal(isValidSpecifier('bad specifier with spaces'), false)
	assert.equal(isValidSpecifier('bad(parens)'), false)
	assert.equal(isValidSpecifier('bad\\backslash'), false)
	assert.equal(isValidSpecifier('import.meta'), false)
	assert.equal(isValidSpecifier('virtual:my-module'), false)
	assert.equal(isValidSpecifier('\0my-module'), false)
	assert.equal(isValidSpecifier('valid-pkg'), true)
	assert.equal(isValidSpecifier('@scope/pkg'), true)
	assert.equal(isValidSpecifier('./relative/path.js'), true)
	assert.equal(isValidSpecifier('node:fs'), true)
})

// 2. Aliases: #x subpath and ~x/@/x
test('aliases: #x resolves via nearest package.json imports, unresolved count as internal alias (never undeclared)', () => {
	const files = {
		'packages/core/package.json': JSON.stringify({
			name: '@vite/core',
			imports: {
				'#internal': './src/internal.js',
				'#utils/*': './src/utils/*.js',
			},
		}),
		'packages/core/src/index.js': `
			import { a } from '#internal';
			import { b } from '#utils/helper';
			import { c } from '#unresolvable-internal';
		`,
		'packages/core/src/internal.js': `export const a = 1;`,
		'packages/core/src/utils/helper.js': `export const b = 2;`,
	}

	const graph = buildGraph(files)
	const indexNode = graph.nodes.find((n) => n.path === 'packages/core/src/index.js')
	const internalNode = graph.nodes.find((n) => n.path === 'packages/core/src/internal.js')
	const helperNode = graph.nodes.find((n) => n.path === 'packages/core/src/utils/helper.js')

	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === internalNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === helperNode.id))

	// #unresolvable-internal is NEVER treated as undeclared package
	assert.ok(!graph.summary.usedButUndeclared.includes('#unresolvable-internal'))
	assert.ok(!graph.summary.usedButUndeclared.some((p) => p.startsWith('#')))
})

test('aliases: ~x and @/x resolve via bundler/tsconfig aliases, unresolvable count in unresolvedAliases (never undeclared)', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'vite-app',
			dependencies: {},
		}),
		'vite.config.ts': `
			export default defineConfig({
				resolve: {
					alias: {
						'@': path.resolve(__dirname, './src'),
						'~': path.resolve(__dirname, './src'),
						'@components': path.resolve(__dirname, './src/components'),
					}
				}
			});
		`,
		'src/index.ts': `
			import { App } from '@/App';
			import { Util } from '~/utils';
			import { Missing } from '@/non-existent';
			import { Another } from '~missing-pkg';
			import { Comp } from '@components/Header';
		`,
		'src/App.ts': `export const App = 1;`,
		'src/utils.ts': `export const Util = 2;`,
	}

	const graph = buildGraph(files)
	const indexNode = graph.nodes.find((n) => n.path === 'src/index.ts')
	const appNode = graph.nodes.find((n) => n.path === 'src/App.ts')
	const utilsNode = graph.nodes.find((n) => n.path === 'src/utils.ts')

	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === appNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === utilsNode.id))

	// Unresolved aliases increment unresolvedAliases counter
	assert.ok(graph.summary.unresolvedAliases >= 3)
	// NEVER reported as usedButUndeclared
	assert.deepEqual(graph.summary.usedButUndeclared, [])
})

// 3. Type-only edges and cycles
test('type-only edges: tagged with typeOnly: true and excluded from runtime cycles', () => {
	const detailedImports = extractImports(`
		import type { TypeA } from './a';
		export type { TypeB } from './b';
		import { type TypeC, type TypeD } from './c';
		import { type TypeE, ValueF } from './f';
		import type from './g';
	`)

	const a = detailedImports.find((e) => e.specifier === './a')
	const b = detailedImports.find((e) => e.specifier === './b')
	const c = detailedImports.find((e) => e.specifier === './c')
	const f = detailedImports.find((e) => e.specifier === './f')
	const g = detailedImports.find((e) => e.specifier === './g')

	assert.equal(a.typeOnly, true)
	assert.equal(b.typeOnly, true)
	assert.equal(c.typeOnly, true)
	assert.equal(f.typeOnly, false) // mixed type and value is value
	assert.equal(g.typeOnly, false) // import type from './g' is default import of 'type'

	// Cycle detection with type-only edge:
	// A -> B (runtime), B -> A (type-only)
	const files = {
		'src/a.ts': `
			import { b } from './b';
			export const a = b + 1;
		`,
		'src/b.ts': `
			import type { AType } from './a';
			export const b = 2;
		`,
	}

	const graph = buildGraph(files)
	// Runtime cycles must NOT include this cycle
	assert.equal(graph.summary.cycles.length, 0)
	// typeOnlyCycles reports it
	assert.equal(graph.summary.typeOnlyCycles.length, 1)
	assert.deepEqual(graph.summary.typeOnlyCycles[0].shortest.sort(), ['src/a.ts', 'src/b.ts'].sort())
})

// 4. Production vs non-production
test('production vs non-production: classification and isolated metrics', () => {
	assert.equal(isNonProductionFile('src/components/Button.tsx'), false)
	assert.equal(isNonProductionFile('src/__tests__/Button.test.tsx'), true)
	assert.equal(isNonProductionFile('tests/integration.ts'), true)
	assert.equal(isNonProductionFile('fixtures/mock-data.json'), true)
	assert.equal(isNonProductionFile('playground/demo.ts'), true)
	assert.equal(isNonProductionFile('docs/guide.ts'), true)
	assert.equal(isNonProductionFile('e2e/login.spec.ts'), true)
	assert.equal(isNonProductionFile('examples/basic/index.js'), true)

	const files = {
		'src/main.ts': `
			import { helper } from './helper';
			export const app = helper();
		`,
		'src/helper.ts': `
			export function helper() { return 42; }
		`,
		'src/orphan.ts': `
			export const unusedProd = true;
		`,
		'tests/test-cycle-a.ts': `
			import { b } from './test-cycle-b';
		`,
		'tests/test-cycle-b.ts': `
			import { a } from './test-cycle-a';
		`,
		'playground/orphan.ts': `
			export const playgroundOrphan = 1;
		`,
	}

	const graph = buildGraph(files)
	const prodNode = graph.nodes.find((n) => n.path === 'src/main.ts')
	const nonProdNode = graph.nodes.find((n) => n.path === 'tests/test-cycle-a.ts')

	assert.equal(prodNode.category, 'production')
	assert.equal(nonProdNode.category, 'non-production')

	// Production cycles: 0
	assert.equal(graph.summary.cycles.length, 0)
	// Production orphans: only src/orphan.ts
	assert.deepEqual(graph.summary.orphans, ['src/orphan.ts'])

	// Non-production summary counts
	assert.equal(graph.summary.nonProduction.cycles, 1)
	assert.equal(graph.summary.nonProduction.orphans, 1) // playground/orphan.ts
})

// 5. Monorepo dependencies & package attribution
test('monorepo dependencies: nearest package attribution, workspace packages ignored, package.json tool keys ignored', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'root-monorepo',
			devDependencies: {
				prettier: '^3.0.0',
				husky: '^8.0.0',
			},
			prettier: {
				singleQuote: true,
			},
			husky: {
				hooks: {
					'pre-commit': 'lint-staged',
				},
			},
			'lint-staged': {
				'*.js': 'eslint --fix',
			},
		}),
		'packages/pkg-a/package.json': JSON.stringify({
			name: '@monorepo/pkg-a',
			dependencies: {
				'@monorepo/pkg-b': 'workspace:*',
				lodash: '^4.17.21',
				unused_in_a: '^1.0.0',
			},
		}),
		'packages/pkg-b/package.json': JSON.stringify({
			name: '@monorepo/pkg-b',
			dependencies: {},
		}),
		'packages/pkg-a/src/index.js': `
			import { b } from '@monorepo/pkg-b';
			import _ from 'lodash';
		`,
		'packages/pkg-b/src/index.js': `
			export const b = 1;
		`,
	}

	const graph = buildGraph(files)

	// Workspace package @monorepo/pkg-b is not undeclared and not external
	assert.ok(!graph.summary.usedButUndeclared.includes('@monorepo/pkg-b'))

	// prettier and husky referenced in package.json keys are not in declaredButUnused
	assert.ok(!graph.summary.declaredButUnused.includes('prettier'))
	assert.ok(!graph.summary.declaredButUnused.includes('husky'))

	// unused_in_a is unused
	assert.ok(graph.summary.declaredButUnused.includes('unused_in_a'))

	// Per-package breakdown
	const pkgA = graph.summary.packages.find((p) => p.name === '@monorepo/pkg-a')
	assert.ok(pkgA)
	assert.deepEqual(pkgA.declaredButUnused, ['unused_in_a'])
	assert.deepEqual(pkgA.usedButUndeclared, [])
})

// 6. HTML: parse <script src> and <link href>, entry candidate
test('html parsing: extracts <script src> and <link href> as edges and marks as entry', () => {
	const files = {
		'index.html': `
			<!DOCTYPE html>
			<html>
				<head>
					<link rel="stylesheet" href="/src/style.css">
				</head>
				<body>
					<script type="module" src="/src/main.ts"></script>
				</body>
			</html>
		`,
		'src/main.ts': `console.log('App loaded');`,
		'src/style.css': `body { margin: 0; }`,
	}

	const graph = buildGraph(files)
	const htmlNode = graph.nodes.find((n) => n.path === 'index.html')
	const mainNode = graph.nodes.find((n) => n.path === 'src/main.ts')

	assert.ok(htmlNode)
	assert.equal(htmlNode.isEntry, true)
	// Edge from index.html to src/main.ts
	assert.ok(graph.edges.some((e) => e[0] === htmlNode.id && e[1] === mainNode.id))
})

// 7. Entry points capped at 25
test('entry points: captures conventional roots and package targets capped at 25', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'many-entries',
			scripts: {
				build: 'node build.js',
			},
		}),
		'src/index.ts': `console.log('root');`,
		'build.js': `console.log('build');`,
	}
	// Add 30 entry files
	for (let i = 1; i <= 30; i++) {
		files[`src/sub${i}/index.ts`] = `console.log(${i});`
	}

	const graph = buildGraph(files)
	assert.ok(graph.summary.entryPoints.length <= 25)
	assert.ok(graph.summary.entryPoints.includes('src/index.ts'))
	assert.ok(graph.summary.entryPoints.includes('build.js'))
})

// 8. Inventory language
test('inventory language: fixed extension map, extensionless and dotfiles map to config/other', () => {
	assert.equal(detectLanguage('index.js'), 'javascript')
	assert.equal(detectLanguage('app.tsx'), 'tsx')
	assert.equal(detectLanguage('MAIN.TS'), 'typescript')
	assert.equal(detectLanguage('README.MD'), 'markdown')
	assert.equal(detectLanguage('.gitignore'), 'config/other')
	assert.equal(detectLanguage('.eslintrc.json'), 'config/other')
	assert.equal(detectLanguage('license'), 'config/other')
	assert.equal(detectLanguage('LICENSE'), 'config/other')
	assert.equal(detectLanguage('_headers'), 'config/other')
	assert.equal(detectLanguage('Dockerfile'), 'config/other')
	assert.equal(detectLanguage('some/deep/path/LICENSE'), 'config/other')
	assert.notEqual(detectLanguage('some/deep/path/LICENSE'), 'some/deep/path/LICENSE')
})

// 9. Acceptance target fixes: relative specifiers (., .., ./, ../)
test('relative specifiers: . and .. resolve to directory index, unresolved count as unresolved, never packages', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'rel-test', dependencies: {} }),
		'src/sub/caller.ts': `
			import localIndex from '.';
			import parentIndex from '..';
			import rootIndex from '../..';
			import missingRel from './non-existent';
			import missingRel2 from '../non-existent2';
		`,
		'src/sub/index.ts': `console.log('sub index');`,
		'src/index.ts': `console.log('src index');`,
		'index.ts': `console.log('root index');`,
	}

	const graph = buildGraph(files)
	const callerNode = graph.nodes.find((n) => n.path === 'src/sub/caller.ts')
	const subIndexNode = graph.nodes.find((n) => n.path === 'src/sub/index.ts')
	const srcIndexNode = graph.nodes.find((n) => n.path === 'src/index.ts')
	const rootIndexNode = graph.nodes.find((n) => n.path === 'index.ts')

	assert.ok(callerNode)
	assert.ok(subIndexNode)
	assert.ok(srcIndexNode)
	assert.ok(rootIndexNode)

	// Edge from caller.ts to src/sub/index.ts via '.' (resolves to directory index)
	assert.ok(graph.edges.some((e) => e[0] === callerNode.id && e[1] === subIndexNode.id))
	// Edge from caller.ts to src/index.ts via '..' (resolves to parent directory index)
	assert.ok(graph.edges.some((e) => e[0] === callerNode.id && e[1] === srcIndexNode.id))
	// Edge from caller.ts to index.ts via '../..' (resolves to root directory index)
	assert.ok(graph.edges.some((e) => e[0] === callerNode.id && e[1] === rootIndexNode.id))

	// Missing relatives counted in unresolvedCount and unresolvedByReason.missing_relative
	assert.ok(graph.summary.unresolvedCount >= 2)
	assert.equal(graph.summary.unresolvedByReason.missing_relative, 2)

	// '.' and '..' are NEVER reported in usedButUndeclared or externals
	assert.ok(!graph.summary.usedButUndeclared.includes('.'))
	assert.ok(!graph.summary.usedButUndeclared.includes('..'))
	assert.ok(!graph.externals.some((ext) => ext.name === '.' || ext.name === '..'))
})

// 10. Lexer regression tests for default, function, string
test('lexer regression tests: object properties, TS interfaces, and options do not extract fake specifiers', () => {
	// (a) snippet: { import: 'default' }
	const codeA = `
		const opts = cleanUrl(url).endsWith('.json')
			? { import: 'default' }
			: undefined;
	`
	const specifiersA = extractImportSpecifiers(codeA)
	assert.equal(specifiersA.includes('default'), false)
	assert.deepEqual(specifiersA, [])

	// (b) snippet: interface { import?: string } ... typeof v === 'function'
	const codeB = `
		interface DynamicImportRequest {
			query?: string | Record<string, string>
			import?: string
		}
		if (typeof v === 'function') {
			doSomething();
		}
	`
	const specifiersB = extractImportSpecifiers(codeB)
	assert.equal(specifiersB.includes('function'), false)
	assert.deepEqual(specifiersB, [])

	// (c) snippet: export interface KnownOptions { import: ['string']; }
	const codeC = `
		export interface KnownOptions {
			as?: string
			query?: string | Record<string, string | number | boolean>
			import: ['string']
		}
	`
	const specifiersC = extractImportSpecifiers(codeC)
	assert.equal(specifiersC.includes('string'), false)
	assert.deepEqual(specifiersC, [])
})

// 11. Yarn PnP virtual module: pnpapi
test('specifier extraction: ignores Yarn PnP virtual module pnpapi', () => {
	const code = `
		import pnp from 'pnpapi';
		import 'pnpapi/subpath';
		import real from 'real-pkg';
	`
	const specifiers = extractImportSpecifiers(code)
	assert.equal(specifiers.includes('pnpapi'), false)
	assert.equal(specifiers.includes('pnpapi/subpath'), false)
	assert.deepEqual(specifiers, ['real-pkg'])
	assert.equal(isValidSpecifier('pnpapi'), false)
	assert.equal(isValidSpecifier('pnpapi/core'), false)
})

// 12. Non-production directory segments & Package.json exclusion
test('non-production directory segments and package.json exclusion from production aggregate', () => {
	assert.equal(isNonProductionFile('__tests__/unit.js'), true)
	assert.equal(isNonProductionFile('packages/__mocks__/mock.js'), true)
	assert.equal(isNonProductionFile('template-react/src/App.jsx'), true)
	assert.equal(isNonProductionFile('templates/starter/index.js'), true)
	assert.equal(isNonProductionFile('misc/util.js'), true)
	assert.equal(isNonProductionFile('playground/main.ts'), true)
	assert.equal(isNonProductionFile('examples/vite-app/index.html'), true)

	const files = {
		'package.json': JSON.stringify({
			name: 'root-monorepo',
			dependencies: { 'prod-dep': '^1.0.0' },
		}),
		'src/index.ts': `import 'prod-dep';`,
		'template-react/package.json': JSON.stringify({
			name: 'template-react',
			dependencies: { 'template-only-dep': '^2.0.0' },
		}),
		'template-react/src/main.tsx': `console.log('starter');`,
	}

	const graph = buildGraph(files)
	// 'template-only-dep' from non-production package must NOT pollute the production aggregate declaredButUnused
	assert.equal(graph.summary.declaredButUnused.includes('template-only-dep'), false)
	// Non-production summary contains non-prod package metrics
	assert.ok(graph.summary.nonProduction.packages >= 1)
	assert.ok(graph.summary.nonProduction.declaredDependencies >= 1)
	assert.ok(graph.summary.nonProduction.declaredButUnused >= 1)
})

// 13. Dependency filtering: workspace:, link:, file:, portal:, and local package names
test('dependency filtering: ignores protocol dependencies (workspace, link, file, portal) and local package names', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'root',
			dependencies: {
				'local-pkg-a': 'workspace:*',
				'linked-lib': 'link:../linked',
				'file-lib': 'file:./local-lib',
				'portal-lib': 'portal:../portal',
				'unused-normal-dep': '^1.0.0',
			},
		}),
		'packages/local-pkg-a/package.json': JSON.stringify({
			name: 'local-pkg-a',
			version: '1.0.0',
		}),
		'packages/local-pkg-a/src/index.ts': `console.log('pkg a');`,
		'src/index.ts': `
			import 'local-pkg-a';
			import 'linked-lib';
		`,
	}

	const graph = buildGraph(files)
	// None of the protocol deps or local package names appear in declaredButUnused
	assert.equal(graph.summary.declaredButUnused.includes('local-pkg-a'), false)
	assert.equal(graph.summary.declaredButUnused.includes('linked-lib'), false)
	assert.equal(graph.summary.declaredButUnused.includes('file-lib'), false)
	assert.equal(graph.summary.declaredButUnused.includes('portal-lib'), false)
	// Only genuine unused normal dependency appears
	assert.ok(graph.summary.declaredButUnused.includes('unused-normal-dep'))
	// Imported local or protocol deps never appear in usedButUndeclared
	assert.equal(graph.summary.usedButUndeclared.includes('local-pkg-a'), false)
	assert.equal(graph.summary.usedButUndeclared.includes('linked-lib'), false)
})

// 14. Orphans: scripts/ and bin/ are tool entry candidates, not orphans
test('orphans: files under scripts/ and bin/ are tool entry candidates and not orphans', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'tool-test' }),
		'scripts/deploy.js': `console.log('deploy script');`,
		'packages/vite/bin/cli.js': `console.log('cli');`,
		'src/actual-orphan.ts': `console.log('orphan');`,
		'src/index.ts': `console.log('main');`,
	}

	const graph = buildGraph(files)
	const deployNode = graph.nodes.find((n) => n.path === 'scripts/deploy.js')
	const binNode = graph.nodes.find((n) => n.path === 'packages/vite/bin/cli.js')
	const orphanNode = graph.nodes.find((n) => n.path === 'src/actual-orphan.ts')

	assert.ok(deployNode)
	assert.equal(deployNode.isEntry, true)
	assert.equal(deployNode.isOrphan, false)

	assert.ok(binNode)
	assert.equal(binNode.isEntry, true)
	assert.equal(binNode.isOrphan, false)

	assert.ok(orphanNode)
	assert.equal(orphanNode.isOrphan, true)
	assert.ok(graph.summary.orphans.includes('src/actual-orphan.ts'))
	assert.equal(graph.summary.orphans.includes('scripts/deploy.js'), false)
	assert.equal(graph.summary.orphans.includes('packages/vite/bin/cli.js'), false)
})

// 15. undeclaredSources on usedButUndeclared
test('usedButUndeclared: includes undeclaredSources with up to 3 file paths', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'sources-test', dependencies: {} }),
		'src/fileA.ts': `import 'unregistered-dep';`,
		'src/fileB.ts': `import 'unregistered-dep';`,
		'src/fileC.ts': `import 'unregistered-dep';`,
		'src/fileD.ts': `import 'unregistered-dep';`,
	}

	const graph = buildGraph(files)
	assert.ok(graph.summary.usedButUndeclared.includes('unregistered-dep'))
	assert.ok(graph.summary.undeclaredSources['unregistered-dep'])
	assert.ok(Array.isArray(graph.summary.undeclaredSources['unregistered-dep']))
	assert.equal(graph.summary.undeclaredSources['unregistered-dep'].length, 3)
	assert.deepEqual(graph.summary.undeclaredSources['unregistered-dep'], [
		'src/fileA.ts',
		'src/fileB.ts',
		'src/fileC.ts',
	])
	// Non-enumerable property on array itself
	assert.ok(graph.summary.usedButUndeclared.undeclaredSources['unregistered-dep'])
})

// 16. note field on declaredButUnused
test('declaredButUnused: includes note field "may be used via config or string references"', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'note-test',
			dependencies: { 'unused-lib': '^1.0.0' },
		}),
		'src/index.ts': `console.log('hi');`,
	}

	const graph = buildGraph(files)
	assert.ok(graph.summary.declaredButUnused.includes('unused-lib'))
	assert.equal(graph.summary.declaredButUnused.note, 'may be used via config or string references')
	assert.equal(graph.summary.declaredButUnusedNote, 'may be used via config or string references')

	const rootPkg = graph.summary.packages.find((p) => p.name === 'note-test')
	assert.ok(rootPkg)
	assert.equal(rootPkg.declaredButUnused.note, 'may be used via config or string references')
	assert.equal(rootPkg.declaredButUnusedNote, 'may be used via config or string references')
})

// 17. Lexer regression test: template literals with comments or URLs do not desynchronize template stack
test('lexer regression test: template literals with URLs/comments do not desync template stack and extract fake imports', () => {
	const code = `
		interface Framework {
			name: string
			link?: \`https://\${string}\`
		}

		const eslintConfigForTS = /* js */ \`
		import js from '@eslint/js'
		import globals from 'globals'
		import reactHooks from 'eslint-plugin-react-hooks'
		import tseslint from 'typescript-eslint'
		\`

		const eslintReactConfig = /* js */ \`
		import reactX from 'eslint-plugin-react-x'
		\`

		import { realHelper } from './realHelper';
	`

	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers, ['./realHelper'])
})

// 18. TypeScript NodeNext extension mapping
test('TypeScript NodeNext extension mapping: relative specifiers ending in .js, .jsx, .mjs, .cjs resolve to matching TS files', () => {
	const filesMap = new Map([
		['src/util.ts', { text: 'export const a = 1;' }],
		['src/component.tsx', { text: 'export const b = 2;' }],
		['src/module.mts', { text: 'export const c = 3;' }],
		['src/common.cts', { text: 'export const d = 4;' }],
	])

	// Direct resolveFilePath assertions
	assert.equal(resolveFilePath('src/util.js', filesMap), 'src/util.ts')
	assert.equal(resolveFilePath('src/component.jsx', filesMap), 'src/component.tsx')
	assert.equal(resolveFilePath('src/module.mjs', filesMap), 'src/module.mts')
	assert.equal(resolveFilePath('src/common.cjs', filesMap), 'src/common.cts')

	// End-to-end buildGraph resolution assertions
	const files = {
		'package.json': JSON.stringify({ name: 'nodenext-test', dependencies: {} }),
		'src/index.ts': `
			import { a } from './util.js';
			import { b } from './component.jsx';
			import { c } from './module.mjs';
			import { d } from './common.cjs';
		`,
		'src/util.ts': `export const a = 1;`,
		'src/component.tsx': `export const b = 2;`,
		'src/module.mts': `export const c = 3;`,
		'src/common.cts': `export const d = 4;`,
	}

	const graph = buildGraph(files)
	const indexNode = graph.nodes.find((n) => n.path === 'src/index.ts')
	const utilNode = graph.nodes.find((n) => n.path === 'src/util.ts')
	const compNode = graph.nodes.find((n) => n.path === 'src/component.tsx')
	const modNode = graph.nodes.find((n) => n.path === 'src/module.mts')
	const cmnNode = graph.nodes.find((n) => n.path === 'src/common.cts')

	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === utilNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === compNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === modNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === cmnNode.id))
	assert.equal(graph.summary.unresolvedCount, 0)
	assert.equal(graph.summary.unresolvedByReason.missing_relative, 0)
})

// 19. Unresolved imports: one for each reason
test('unresolved imports: classifies reason as relative-not-found, directory-index-not-found, alias-unresolved, package-imports-unresolved, and other', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'reason-test',
			imports: {
				'#internal/*': './src/internal/*',
			},
		}),
		'src/index.js': `
			import './missing-file.js';
			import './components';
			import '@/missing-alias';
			import '#internal/missing';
			import '/absolute-missing.js';
		`,
		'src/components/Button.js': `export const Button = 1;`,
	}

	const graph = buildGraph(files)
	const unresolved = graph.unresolvedImports

	assert.ok(Array.isArray(unresolved))
	assert.equal(unresolved.length, 5)

	const relNotFound = unresolved.find((u) => u.specifier === './missing-file.js')
	assert.ok(relNotFound)
	assert.equal(relNotFound.reason, 'relative-not-found')
	assert.equal(relNotFound.category, 'production')

	const dirIndexNotFound = unresolved.find((u) => u.specifier === './components')
	assert.ok(dirIndexNotFound)
	assert.equal(dirIndexNotFound.reason, 'directory-index-not-found')
	assert.equal(dirIndexNotFound.category, 'production')

	const aliasUnresolved = unresolved.find((u) => u.specifier === '@/missing-alias')
	assert.ok(aliasUnresolved)
	assert.equal(aliasUnresolved.reason, 'alias-unresolved')
	assert.equal(aliasUnresolved.category, 'production')

	const pkgImportsUnresolved = unresolved.find((u) => u.specifier === '#internal/missing')
	assert.ok(pkgImportsUnresolved)
	assert.equal(pkgImportsUnresolved.reason, 'package-imports-unresolved')
	assert.equal(pkgImportsUnresolved.category, 'production')

	const otherUnresolved = unresolved.find((u) => u.specifier === '/absolute-missing.js')
	assert.ok(otherUnresolved)
	assert.equal(otherUnresolved.reason, 'other')
	assert.equal(otherUnresolved.category, 'production')

	// Summary production unresolvedByReason counts
	assert.equal(graph.summary.unresolvedByReason['relative-not-found'], 1)
	assert.equal(graph.summary.unresolvedByReason['directory-index-not-found'], 1)
	assert.equal(graph.summary.unresolvedByReason['alias-unresolved'], 1)
	assert.equal(graph.summary.unresolvedByReason['package-imports-unresolved'], 1)
	assert.equal(graph.summary.unresolvedByReason['other'], 1)
})

// 20. Unresolved imports: production vs non-production separation
test('unresolved imports: production vs non-production counts separated correctly', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'prod-nonprod-test', dependencies: {} }),
		'src/prod.js': `
			import './missing-prod.js';
		`,
		'tests/test.spec.js': `
			import './missing-test.js';
			import './missing-test2.js';
		`,
	}

	const graph = buildGraph(files)
	assert.equal(graph.summary.unresolvedCount, 3)
	assert.equal(graph.summary.unresolvedByReason['relative-not-found'], 1)
	assert.equal(graph.summary.nonProduction.unresolved, 2)
})

// 21. Unresolved imports: cap at 500 entries and return truncated: true
test('unresolved imports: capped at 500 entries and sets truncated: true with true total count', () => {
	const importsLines = []
	for (let i = 0; i < 520; i++) {
		importsLines.push(`import './missing_${i}.js';`)
	}

	const files = {
		'package.json': JSON.stringify({ name: 'cap-test', dependencies: {} }),
		'src/index.js': importsLines.join('\n'),
	}

	const graph = buildGraph(files)
	assert.equal(graph.unresolvedImports.length, 500)
	assert.equal(graph.unresolvedImports.truncated, true)
	assert.equal(graph.unresolvedImports.count, 520)
	assert.equal(graph.unresolvedImports.totalCount, 520)
	assert.equal(graph.unresolvedCount, 520)
	assert.equal(graph.unresolvedTruncated, true)
	assert.equal(graph.summary.unresolvedCount, 520)
	assert.equal(graph.summary.unresolvedTruncated, true)
})

// 22. Unresolved imports: count equals array length when not truncated
test('unresolved imports: count equals array length and truncated is false when below 500', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'not-truncated-test', dependencies: {} }),
		'src/index.js': `
			import './missing1.js';
			import './missing2.js';
			import './missing3.js';
		`,
	}

	const graph = buildGraph(files)
	assert.equal(graph.unresolvedImports.length, 3)
	assert.equal(graph.unresolvedImports.truncated, false)
	assert.equal(graph.unresolvedImports.count, graph.unresolvedImports.length)
	assert.equal(graph.unresolvedCount, 3)
	assert.equal(graph.unresolvedTruncated, false)
	assert.equal(graph.summary.unresolvedCount, 3)
	assert.equal(graph.summary.unresolvedTruncated, false)
})

// 23. @vite/* virtual specifiers
test('@vite/* specifiers: treated as virtual modules and excluded from graph and undeclared imports', () => {
	assert.equal(isValidSpecifier('@vite/client'), false)
	assert.equal(isValidSpecifier('@vite/env'), false)
	assert.equal(isValidSpecifier('@vite'), false)
	assert.equal(isValidSpecifier('@vitejs/plugin-vue'), true)

	const files = {
		'package.json': JSON.stringify({ name: 'vite-virtual-test', dependencies: {} }),
		'src/client.ts': `
			// @ts-expect-error internal virtual module
			import '@vite/env';
			import client from '@vite/client';
			import { helper } from './helper';
		`,
		'src/helper.ts': 'export const helper = 1;',
	}

	const graph = buildGraph(files)
	assert.deepEqual(graph.summary.usedButUndeclared, [])
	assert.equal(graph.summary.unresolvedCount, 0)
	assert.ok(!graph.unresolvedImports.some((u) => u.specifier.startsWith('@vite/')))
})

// 24. Relative specifier .d.ts / .d.mts / .d.cts fallback
test('TypeScript NodeNext extension mapping: relative .js, .mjs, .cjs resolve to .d.ts, .d.mts, .d.cts', () => {
	assert.equal(resolveFilePath('src/types.js', new Map([['src/types.d.ts', {}]])), 'src/types.d.ts')
	assert.equal(resolveFilePath('src/module.mjs', new Map([['src/module.d.mts', {}]])), 'src/module.d.mts')
	assert.equal(resolveFilePath('src/common.cjs', new Map([['src/common.d.cts', {}]])), 'src/common.d.cts')

	const files = {
		'package.json': JSON.stringify({ name: 'dts-resolve-test', dependencies: {} }),
		'src/index.ts': `
			import { A } from './types.js';
			import { B } from './module.mjs';
			import { C } from './common.cjs';
		`,
		'src/types.d.ts': 'export type A = string;',
		'src/module.d.mts': 'export type B = number;',
		'src/common.d.cts': 'export type C = boolean;',
	}

	const graph = buildGraph(files)
	const indexNode = graph.nodes.find((n) => n.path === 'src/index.ts')
	const typesNode = graph.nodes.find((n) => n.path === 'src/types.d.ts')
	const modNode = graph.nodes.find((n) => n.path === 'src/module.d.mts')
	const cmnNode = graph.nodes.find((n) => n.path === 'src/common.d.cts')

	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === typesNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === modNode.id))
	assert.ok(graph.edges.some((e) => e[0] === indexNode.id && e[1] === cmnNode.id))
	assert.equal(graph.summary.unresolvedCount, 0)
})

// 25. Type-only imports and declaration files are not counted as package usage
test('type-only external imports and declaration file imports are not counted as package usage', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'type-only-test', dependencies: {} }),
		'packages/vite/package.json': JSON.stringify({ name: 'vite', dependencies: {} }),
		'packages/vite/src/node/utils.ts': `
			import type { Equal } from '@type-challenges/utils';
			import type { DecodedSourceMap } from '@jridgewell/remapping';
			import { realHelper } from 'undeclared-runtime-pkg';
		`,
		'packages/vite/src/types/package.json': JSON.stringify({ version: '0.0.0' }),
		'packages/vite/src/types/alias.d.ts': `
			import type { FunctionPluginHooks } from 'rolldown';
		`,
		'packages/vite/src/types/shims.d.ts': `
			import type { Plugin } from 'postcss';
		`,
	}

	const graph = buildGraph(files)
	// @type-challenges/utils, rolldown, postcss are type-only imports and must NOT be in usedButUndeclared
	assert.ok(!graph.summary.usedButUndeclared.includes('@type-challenges/utils'))
	assert.ok(!graph.summary.usedButUndeclared.includes('rolldown'))
	assert.ok(!graph.summary.usedButUndeclared.includes('postcss'))
	assert.deepEqual(graph.summary.usedButUndeclared, ['undeclared-runtime-pkg'])

	const vitePkg = graph.summary.packages.find((p) => p.dir === 'packages/vite')
	assert.ok(vitePkg)
	assert.deepEqual(vitePkg.usedButUndeclared, ['undeclared-runtime-pkg'])

	const typesPkg = graph.summary.packages.find((p) => p.dir === 'packages/vite/src/types')
	assert.ok(typesPkg)
	assert.deepEqual(typesPkg.usedButUndeclared, [])
})

// 26. Nearest package.json attribution: each import counted once under its nearest package.json
test('nearest package.json attribution: nested package.json files do not duplicate undeclared imports', () => {
	const files = {
		'package.json': JSON.stringify({ name: 'root-monorepo', dependencies: {} }),
		'packages/vite/package.json': JSON.stringify({ name: 'vite', dependencies: {} }),
		'packages/vite/src/types/package.json': JSON.stringify({ version: '0.0.0' }),
		'packages/vite/src/node/utils.ts': `
			import { runtimePkgA } from 'runtime-pkg-a';
		`,
		'packages/vite/src/types/alias.ts': `
			import { runtimePkgB } from 'runtime-pkg-b';
		`,
	}

	const graph = buildGraph(files)
	const vitePkg = graph.summary.packages.find((p) => p.dir === 'packages/vite')
	const typesPkg = graph.summary.packages.find((p) => p.dir === 'packages/vite/src/types')

	assert.ok(vitePkg)
	assert.ok(typesPkg)

	// runtime-pkg-a is strictly under packages/vite
	assert.deepEqual(vitePkg.usedButUndeclared, ['runtime-pkg-a'])
	// runtime-pkg-b is strictly under packages/vite/src/types
	assert.deepEqual(typesPkg.usedButUndeclared, ['runtime-pkg-b'])

	// Neither repeats the other's undeclared names
	assert.ok(!vitePkg.usedButUndeclared.includes('runtime-pkg-b'))
	assert.ok(!typesPkg.usedButUndeclared.includes('runtime-pkg-a'))
})

// 27. Type-only imports: package used only via import type is not reported unused, and undeclared name used only via import type is not reported undeclared
test('type-only imports: package used only via import type is not reported unused, and undeclared name used only via import type is not reported undeclared', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'type-only-usage-test',
			dependencies: {
				'declared-type-only-pkg': '^1.0.0',
				'declared-unused-pkg': '^1.0.0',
			},
		}),
		'src/index.ts': `
			import type { SomeType } from 'declared-type-only-pkg';
			import type { UndeclaredType } from 'undeclared-type-only-pkg';
			import { runtimeHelper } from './helper';
		`,
		'src/helper.ts': `
			export const runtimeHelper = 42;
		`,
		'src/types.d.ts': `
			import type { Plugin } from 'declared-type-only-pkg';
			import { AnotherUndeclared } from 'undeclared-dts-pkg';
		`,
	}

	const graph = buildGraph(files)

	// 1. package used only via import type is NOT reported unused
	assert.ok(!graph.summary.declaredButUnused.includes('declared-type-only-pkg'))
	// Truly unused package IS reported unused
	assert.ok(graph.summary.declaredButUnused.includes('declared-unused-pkg'))

	// 2. undeclared name used only via import type (or in .d.ts) is NOT reported undeclared
	assert.ok(!graph.summary.usedButUndeclared.includes('undeclared-type-only-pkg'))
	assert.ok(!graph.summary.usedButUndeclared.includes('undeclared-dts-pkg'))
	assert.deepEqual(graph.summary.usedButUndeclared, [])
})



