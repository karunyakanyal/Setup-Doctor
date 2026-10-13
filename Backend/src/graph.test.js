const assert = require('node:assert/strict')
const test = require('node:test')
const {
	buildGraph,
	getImpact,
	extractImportSpecifiers,
	normalizeExternalPackageName,
} = require('./services/graph')

test('graph tokenizer: ignores imports inside comments and strings', () => {
	const code = `
		// import fake1 from './fake1';
		/*
		   import fake2 from './fake2';
		   require('./fake3');
		*/
		const str1 = "import fake4 from './fake4'";
		const str2 = 'require("./fake5")';
		const tmpl = \`
			import fake6 from './fake6';
		\`;
		import real1 from './real1';
		const real2 = require('./real2');
		export { something } from './real3';
		const dyn = import('./real4');
	`
	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers.sort(), ['./real1', './real2', './real3', './real4'].sort())
})

test('graph tokenizer: handles export const from and import.meta without false positives', () => {
	const code = `
		import.meta.url;
		export const from = "some-string";
		export default function() {}
		export { a } from './real-export';
	`
	const specifiers = extractImportSpecifiers(code)
	assert.deepEqual(specifiers, ['./real-export'])
})

test('graph helper: normalizeExternalPackageName and builtins', () => {
	assert.equal(normalizeExternalPackageName('react'), 'react')
	assert.equal(normalizeExternalPackageName('react/jsx-runtime'), 'react')
	assert.equal(normalizeExternalPackageName('@babel/core/lib'), '@babel/core')
	assert.equal(normalizeExternalPackageName('node:fs/promises'), 'node:fs/promises')
	assert.equal(normalizeExternalPackageName(''), '')
})

test('graph builder: resolves relative imports with extensions, index files, and TS .js -> .ts mapping', () => {
	const files = {
		'src/index.ts': `
			import { a } from './a';
			import { b } from './b.js'; // TS emit convention pointing to b.ts
			import { util } from './utils';
		`,
		'src/a.ts': `export const a = 1;`,
		'src/b.ts': `export const b = 2;`,
		'src/utils/index.ts': `export const util = true;`,
	}

	const result = buildGraph(files)

	assert.equal(result.nodes.length, 4)
	const indexNode = result.nodes.find((n) => n.path === 'src/index.ts')
	const aNode = result.nodes.find((n) => n.path === 'src/a.ts')
	const bNode = result.nodes.find((n) => n.path === 'src/b.ts')
	const utilNode = result.nodes.find((n) => n.path === 'src/utils/index.ts')

	assert.ok(indexNode && aNode && bNode && utilNode)
	assert.equal(indexNode.fanOut, 3)
	assert.equal(aNode.fanIn, 1)
	assert.equal(bNode.fanIn, 1)
	assert.equal(utilNode.fanIn, 1)

	// Edges from index to all 3
	assert.ok(result.edges.some(([from, to]) => from === indexNode.id && to === aNode.id))
	assert.ok(result.edges.some(([from, to]) => from === indexNode.id && to === bNode.id))
	assert.ok(result.edges.some(([from, to]) => from === indexNode.id && to === utilNode.id))
	assert.equal(result.summary.unresolvedCount, 0)
})

test('graph builder: resolves tsconfig.json baseUrl and paths aliases', () => {
	const files = {
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				baseUrl: '.',
				paths: {
					'@/*': ['src/*'],
					'@components': ['src/components/index.tsx'],
				},
			},
		}),
		'src/main.tsx': `
			import { App } from '@/App';
			import { Header } from '@components';
		`,
		'src/App.tsx': `export const App = () => null;`,
		'src/components/index.tsx': `export const Header = () => null;`,
	}

	const result = buildGraph(files)

	const mainNode = result.nodes.find((n) => n.path === 'src/main.tsx')
	const appNode = result.nodes.find((n) => n.path === 'src/App.tsx')
	const compNode = result.nodes.find((n) => n.path === 'src/components/index.tsx')

	assert.ok(mainNode && appNode && compNode)
	assert.ok(result.edges.some(([from, to]) => from === mainNode.id && to === appNode.id))
	assert.ok(result.edges.some(([from, to]) => from === mainNode.id && to === compNode.id))
})

test('graph builder: parses Vue SFC script tags and resolves imports', () => {
	const files = {
		'src/App.vue': `
			<template><div>{{ msg }}</div></template>
			<script setup>
				import HelloWorld from './components/HelloWorld.vue';
			</script>
		`,
		'src/components/HelloWorld.vue': `
			<template><span>Hello</span></template>
		`,
	}

	const result = buildGraph(files)
	const appNode = result.nodes.find((n) => n.path === 'src/App.vue')
	const helloNode = result.nodes.find((n) => n.path === 'src/components/HelloWorld.vue')

	assert.ok(appNode && helloNode)
	assert.ok(result.edges.some(([from, to]) => from === appNode.id && to === helloNode.id))
})

test('graph builder: resolves monorepo workspace packages', () => {
	const files = {
		'packages/pkg-a/package.json': JSON.stringify({
			name: '@workspace/pkg-a',
			main: 'src/index.js',
		}),
		'packages/pkg-a/src/index.js': `module.exports = { a: 1 };`,
		'packages/pkg-b/package.json': JSON.stringify({
			name: '@workspace/pkg-b',
			main: 'src/index.js',
		}),
		'packages/pkg-b/src/index.js': `
			const { a } = require('@workspace/pkg-a');
			module.exports = { b: a + 1 };
		`,
	}

	const result = buildGraph(files)
	const aNode = result.nodes.find((n) => n.path === 'packages/pkg-a/src/index.js')
	const bNode = result.nodes.find((n) => n.path === 'packages/pkg-b/src/index.js')

	assert.ok(aNode && bNode)
	assert.ok(result.edges.some(([from, to]) => from === bNode.id && to === aNode.id))
})

test('graph builder: tracks externals, declaredButUnused, usedButUndeclared, and builtins', () => {
	const files = {
		'package.json': JSON.stringify({
			dependencies: {
				express: '^4.18.0',
				lodash: '^4.17.21',
			},
		}),
		'src/server.js': `
			const express = require('express');
			const fs = require('fs');
			const uninstalled = require('missing-package');
		`,
	}

	const result = buildGraph(files)

	// Builtin fs is handled and not flagged as undeclared
	const fsExt = result.externals.find((e) => e.name === 'fs')
	assert.ok(fsExt)
	assert.equal(fsExt.declared, true)

	// express is declared and used
	const expressExt = result.externals.find((e) => e.name === 'express')
	assert.ok(expressExt)
	assert.equal(expressExt.declared, true)

	// lodash is declared but unused
	assert.ok(result.summary.declaredButUnused.includes('lodash'))
	assert.equal(result.summary.declaredButUnused.includes('express'), false)

	// missing-package is used but undeclared
	assert.ok(result.summary.usedButUndeclared.includes('missing-package'))
	assert.equal(result.summary.usedButUndeclared.includes('fs'), false)
})

test('graph builder: detects cycles (Tarjan SCC), orphans, longest chain, and hotspots', () => {
	const files = {
		'src/cycleA.js': `import './cycleB';`,
		'src/cycleB.js': `import './cycleA';`,
		'src/orphan.js': `const isolated = true;`,
		'src/chain1.js': `import './chain2';`,
		'src/chain2.js': `import './chain3';`,
		'src/chain3.js': `const end = 1;`,
	}

	const result = buildGraph(files)

	// Cycle detection
	assert.equal(result.summary.cycles.length, 1)
	assert.ok(result.summary.cycles[0].includes('src/cycleA.js'))
	assert.ok(result.summary.cycles[0].includes('src/cycleB.js'))

	// Orphans
	assert.ok(result.summary.orphans.includes('src/orphan.js'))

	// Longest chain: chain1 -> chain2 -> chain3 (depth 3)
	assert.ok(result.summary.longestChain >= 3)

	// Hotspots by fanIn and transitive impact
	assert.ok(Array.isArray(result.summary.hotspots.byFanIn))
	assert.ok(Array.isArray(result.summary.hotspots.byTransitiveImpact))
	assert.equal(result.summary.approximate, undefined) // approximate moved to coverage
})

test('graph cache: stores only built graph and inventory with max 3 entries (LRU eviction)', () => {
	const {
		setCachedGraph,
		getCachedGraph,
		clearGraphCache,
		getGraphCacheSize,
		MAX_GRAPH_CACHE_ENTRIES,
	} = require('./services/graph')

	clearGraphCache()
	assert.equal(MAX_GRAPH_CACHE_ENTRIES, 3)

	const dummyPayload = (name) => ({
		inventory: { totalFiles: 1, analyzedFiles: 1 },
		graph: { nodes: [{ id: 0, path: `${name}.js` }], edges: [], externals: [] },
		summary: { parsedFiles: 1 },
		coverage: { analyzedFiles: 1, totalFiles: 1, skipped: {}, truncated: false, approximate: true },
	})

	setCachedGraph('o1', 'r1', 'main', dummyPayload('repo1'))
	setCachedGraph('o2', 'r2', 'main', dummyPayload('repo2'))
	setCachedGraph('o3', 'r3', 'main', dummyPayload('repo3'))

	assert.equal(getGraphCacheSize(), 3)
	assert.ok(getCachedGraph('o1', 'r1', 'main'))
	assert.ok(getCachedGraph('o2', 'r2', 'main'))
	assert.ok(getCachedGraph('o3', 'r3', 'main'))

	// Adding a 4th repo should evict the oldest entry ('o1/r1/main')
	setCachedGraph('o4', 'r4', 'main', dummyPayload('repo4'))
	assert.equal(getGraphCacheSize(), 3)
	assert.equal(getCachedGraph('o1', 'r1', 'main'), null, 'o1 should be evicted')
	assert.ok(getCachedGraph('o2', 'r2', 'main'))
	assert.ok(getCachedGraph('o3', 'r3', 'main'))
	assert.ok(getCachedGraph('o4', 'r4', 'main'))

	// Cached payload contains no raw file text
	const cached = getCachedGraph('o4', 'r4', 'main')
	assert.equal(cached.files, undefined)

	// Expired entries return null
	setCachedGraph('o5', 'r5', 'main', dummyPayload('repo5'), -1) // expired
	assert.equal(getCachedGraph('o5', 'r5', 'main'), null)

	clearGraphCache()
})

test('getImpact: computes direct, transitive impact and percentOfRepo via reverse BFS', () => {
	// A -> B -> C -> D
	// E -> C
	const files = {
		'src/a.js': `import './b';`,
		'src/b.js': `import './c';`,
		'src/c.js': `import './d';`,
		'src/d.js': `export const d = 1;`,
		'src/e.js': `import './c';`,
	}

	const graph = buildGraph(files)

	// When D changes: direct impact = C; transitive impact = C, B, A, E (all 4 upstream files)
	const impactD = getImpact(graph, 'src/d.js')
	assert.deepEqual(impactD.direct, ['src/c.js'])
	assert.equal(impactD.transitive.length, 4)
	assert.ok(impactD.transitive.includes('src/c.js'))
	assert.ok(impactD.transitive.includes('src/b.js'))
	assert.ok(impactD.transitive.includes('src/a.js'))
	assert.ok(impactD.transitive.includes('src/e.js'))
	assert.equal(impactD.percentOfRepo, 80.0) // 4 out of 5 files = 80%

	// Relative path './src/d.js' or numeric id also works
	const impactWithDot = getImpact(graph, './src/d.js')
	assert.deepEqual(impactWithDot.direct, ['src/c.js'])

	// Leaf node A has nothing depending on it
	const impactA = getImpact(graph, 'src/a.js')
	assert.deepEqual(impactA.direct, [])
	assert.deepEqual(impactA.transitive, [])
	assert.equal(impactA.percentOfRepo, 0)
})

test('graph builder: caps nodes at 3000, sets truncated: true, and records graphNodesOmitted', () => {
	const files = new Map()
	for (let i = 0; i < 3005; i++) {
		files.set(`src/file_${i}.js`, {
			text: `export const val_${i} = ${i};`,
			lang: 'javascript',
			size: 20,
		})
	}

	const result = buildGraph(files)

	assert.equal(result.nodes.length, 3000)
	assert.equal(result.truncated, true)
	assert.equal(result.graphNodesOmitted, 5)
	assert.equal(result.summary.parsedFiles, 3000)
})

test('graph builder: under 3000 nodes sets truncated: false and graphNodesOmitted: 0', () => {
	const files = {
		'src/a.js': 'export const a = 1;',
		'src/b.js': 'import "./a";',
	}

	const result = buildGraph(files)

	assert.equal(result.nodes.length, 2)
	assert.equal(result.truncated, false)
	assert.equal(result.graphNodesOmitted, 0)
})

test('graph builder: config files, test setup, entry points, and declaration files are not orphans and excluded from hotspots', () => {
	const files = {
		'vite.config.js': 'export default {};',
		'.eslintrc.js': 'module.exports = {};',
		'src/setupTests.ts': 'import "@testing-library/jest-dom";',
		'src/types.d.ts': 'declare type ID = string;',
		'src/index.js': 'console.log("entry");',
		'src/utils.test.js': 'console.log("test");',
		'tests/integration.spec.ts': 'console.log("spec");',
		'src/__tests__/unit.js': 'console.log("unit");',
		'src/regular-orphan.js': 'const isolated = 1;',
	}

	const result = buildGraph(files)

	// Regular orphan is flagged
	assert.ok(result.summary.orphans.includes('src/regular-orphan.js'))

	// Config, setup, entry, declaration, and test files are NOT orphans
	assert.equal(result.summary.orphans.includes('vite.config.js'), false)
	assert.equal(result.summary.orphans.includes('.eslintrc.js'), false)
	assert.equal(result.summary.orphans.includes('src/setupTests.ts'), false)
	assert.equal(result.summary.orphans.includes('src/types.d.ts'), false)
	assert.equal(result.summary.orphans.includes('src/index.js'), false)
	assert.equal(result.summary.orphans.includes('src/utils.test.js'), false)
	assert.equal(result.summary.orphans.includes('tests/integration.spec.ts'), false)
	assert.equal(result.summary.orphans.includes('src/__tests__/unit.js'), false)

	// isOrphan and isTest property on nodes
	const viteNode = result.nodes.find((n) => n.path === 'vite.config.js')
	const eslintNode = result.nodes.find((n) => n.path === '.eslintrc.js')
	const setupNode = result.nodes.find((n) => n.path === 'src/setupTests.ts')
	const typesNode = result.nodes.find((n) => n.path === 'src/types.d.ts')
	const indexNode = result.nodes.find((n) => n.path === 'src/index.js')
	const testNode = result.nodes.find((n) => n.path === 'src/utils.test.js')
	const specNode = result.nodes.find((n) => n.path === 'tests/integration.spec.ts')
	const unitNode = result.nodes.find((n) => n.path === 'src/__tests__/unit.js')
	const orphanNode = result.nodes.find((n) => n.path === 'src/regular-orphan.js')

	assert.equal(viteNode.isOrphan, false)
	assert.equal(viteNode.isConfig, true)
	assert.equal(eslintNode.isOrphan, false)
	assert.equal(eslintNode.isConfig, true)
	assert.equal(setupNode.isOrphan, false)
	assert.equal(typesNode.isOrphan, false)
	assert.equal(indexNode.isOrphan, false)
	assert.equal(testNode.isOrphan, false)
	assert.equal(testNode.isTest, true)
	assert.equal(specNode.isOrphan, false)
	assert.equal(specNode.isTest, true)
	assert.equal(unitNode.isOrphan, false)
	assert.equal(unitNode.isTest, true)
	assert.equal(orphanNode.isOrphan, true)

	// configFiles list in summary
	assert.ok(result.summary.configFiles.includes('vite.config.js'))
	assert.ok(result.summary.configFiles.includes('.eslintrc.js'))

	// Hotspots exclude config files
	assert.equal(result.summary.hotspots.byFanIn.some((h) => h.path === 'vite.config.js'), false)
	assert.equal(result.summary.hotspots.byTransitiveImpact.some((h) => h.path === 'vite.config.js'), false)
})

test('graph builder: declaredButUnused ignores @types/*, tooling packages, and packages referenced in scripts/configs', () => {
	const files = {
		'package.json': JSON.stringify({
			scripts: {
				build: 'vite build',
				lint: 'eslint .',
				test: 'vitest run',
				clean: 'rimraf dist',
				format: 'prettier --write .',
			},
			dependencies: {
				react: '^18.0.0',
				lodash: '^4.17.21',
				rimraf: '^5.0.0',
			},
			devDependencies: {
				'@types/node': '^20.0.0',
				'@types/react': '^18.0.0',
				'eslint': '^8.0.0',
				'prettier': '^3.0.0',
				'vite': '^5.0.0',
				'@vitejs/plugin-react': '^4.0.0',
				'vitest': '^1.0.0',
				'jest': '^29.0.0',
			},
		}),
		'src/index.js': `
			import React from 'react';
			console.log(React);
		`,
		'vite.config.js': `
			import { defineConfig } from 'vite';
			import react from '@vitejs/plugin-react';
			export default defineConfig({});
		`,
	}

	const result = buildGraph(files)

	// react is used in src/index.js
	assert.equal(result.summary.declaredButUnused.includes('react'), false)

	// lodash is unused and not tooling -> must be flagged
	assert.ok(result.summary.declaredButUnused.includes('lodash'))

	// @types must be ignored unconditionally
	assert.equal(result.summary.declaredButUnused.includes('@types/node'), false)
	assert.equal(result.summary.declaredButUnused.includes('@types/react'), false)

	// Tooling packages referenced in scripts or configs must be ignored
	assert.equal(result.summary.declaredButUnused.includes('eslint'), false)
	assert.equal(result.summary.declaredButUnused.includes('prettier'), false)
	assert.equal(result.summary.declaredButUnused.includes('vite'), false)
	assert.equal(result.summary.declaredButUnused.includes('@vitejs/plugin-react'), false)
	assert.equal(result.summary.declaredButUnused.includes('vitest'), false)
	assert.equal(result.summary.declaredButUnused.includes('rimraf'), false)

	// jest is NOT referenced in scripts or configs -> must be flagged
	assert.ok(result.summary.declaredButUnused.includes('jest'))
})

test('graph builder: entry heuristics limit depth and multi-package scripts support .mjs/.cjs/.mts', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'root',
			scripts: {
				start: 'node src/server.mjs',
			},
		}),
		'packages/pkgA/package.json': JSON.stringify({
			name: 'pkg-a',
			scripts: {
				run: 'node src/runner.cjs',
			},
		}),
		'index.js': 'console.log("root index");',
		'src/index.js': 'console.log("src index");',
		'src/server.mjs': 'console.log("server");',
		'packages/pkgA/src/runner.cjs': 'console.log("runner");',
		'packages/pkgA/main.js': 'console.log("pkg main");',
		'src/components/button/index.js': 'console.log("nested index");',
	}

	const result = buildGraph(files)

	const rootIndex = result.nodes.find((n) => n.path === 'index.js')
	const srcIndex = result.nodes.find((n) => n.path === 'src/index.js')
	const serverMjs = result.nodes.find((n) => n.path === 'src/server.mjs')
	const runnerCjs = result.nodes.find((n) => n.path === 'packages/pkgA/src/runner.cjs')
	const pkgMain = result.nodes.find((n) => n.path === 'packages/pkgA/main.js')
	const nestedIndex = result.nodes.find((n) => n.path === 'src/components/button/index.js')

	assert.equal(rootIndex.isEntry, true)
	assert.equal(srcIndex.isEntry, true)
	assert.equal(serverMjs.isEntry, true)
	assert.equal(runnerCjs.isEntry, true)
	assert.equal(pkgMain.isEntry, true)
	// Nested index (> 1 level below package root) is NOT an entry heuristic
	assert.equal(nestedIndex.isEntry, false)
})

test('graph builder: detects shortest cycle via BFS and produces hint when containing app root file', () => {
	const files = {
		'src/App.jsx': `
			import { childA } from './childA';
			export const appVal = 1;
		`,
		'src/childA.js': `
			import { appVal } from './App';
			import { childB } from './childB';
			export const childA = 2;
		`,
		'src/childB.js': `
			import { childA } from './childA';
			export const childB = 3;
		`,
	}

	const result = buildGraph(files)

	assert.equal(result.summary.cycles.length, 1)
	const cycle = result.summary.cycles[0]

	// Cycle object array compatibility
	assert.ok(cycle.includes('src/App.jsx'))
	assert.ok(cycle.includes('src/childA.js'))
	assert.ok(cycle.includes('src/childB.js'))

	// Shortest loop via BFS: App.jsx <-> childA.js (length 2)
	assert.ok(Array.isArray(cycle.shortest))
	assert.equal(cycle.shortest.length, 2)
	assert.ok(cycle.shortest.includes('src/App.jsx'))
	assert.ok(cycle.shortest.includes('src/childA.js'))

	// Root file hint
	assert.equal(
		cycle.hint,
		'Shared exports in App.jsx are imported back by children; move them to a separate module.'
	)

	// JSON serialization
	const serialized = JSON.parse(JSON.stringify(cycle))
	assert.ok(Array.isArray(serialized.files))
	assert.ok(Array.isArray(serialized.shortest))
	assert.equal(serialized.shortest.length, 2)
	assert.equal(
		serialized.hint,
		'Shared exports in App.jsx are imported back by children; move them to a separate module.'
	)
})

test('graph builder: computes language coverage, inventory-only languages, and graphFiles', () => {
	const files = {
		'src/main.ts': 'export const x = 1;',
		'src/index.js': 'import "./main";',
		'scripts/deploy.py': 'print("deploy")',
		'docs/readme.md': '# Docs',
	}

	const result = buildGraph(files)

	assert.equal(result.graphFiles, 2)
	assert.equal(result.coverage.graphFiles, 2)
	assert.deepEqual(result.coverage.graphLanguages, {
		typescript: 1,
		javascript: 1,
	})
	assert.equal(result.coverage.inventoryOnlyLanguages['python'], 1)
	assert.equal(result.coverage.inventoryOnlyLanguages['markdown'], 1)
})

test('graph builder: postcss.config.js with plugins: { tailwindcss: {}, autoprefixer: {} } marks both referenced', () => {
	const files = {
		'package.json': JSON.stringify({
			dependencies: {
				tailwindcss: '^3.4.0',
				autoprefixer: '^10.4.0',
				unreferenced: '^1.0.0',
			},
		}),
		'postcss.config.js': `
			module.exports = {
				plugins: {
					tailwindcss: {},
					autoprefixer: {},
				},
			};
		`,
		'src/index.js': 'console.log("app");',
	}

	const result = buildGraph(files)
	assert.equal(result.summary.declaredButUnused.includes('tailwindcss'), false)
	assert.equal(result.summary.declaredButUnused.includes('autoprefixer'), false)
	assert.ok(result.summary.declaredButUnused.includes('unreferenced'))
})

test('graph builder: script "tsc -b" references typescript', () => {
	const files = {
		'package.json': JSON.stringify({
			scripts: {
				build: 'tsc -b',
			},
			devDependencies: {
				typescript: '^5.0.0',
			},
		}),
		'src/index.js': 'console.log("app");',
	}

	const result = buildGraph(files)
	assert.equal(result.summary.declaredButUnused.includes('typescript'), false)
})

test('graph builder: script bin aliases for ng and playwright', () => {
	const files = {
		'package.json': JSON.stringify({
			scripts: {
				serve: 'ng serve',
				test: 'playwright test',
			},
			devDependencies: {
				'@angular/cli': '^17.0.0',
				'@playwright/test': '^1.40.0',
			},
		}),
		'src/index.js': 'console.log("app");',
	}

	const result = buildGraph(files)
	assert.equal(result.summary.declaredButUnused.includes('@angular/cli'), false)
	assert.equal(result.summary.declaredButUnused.includes('@playwright/test'), false)
})

test('graph builder: "vitest run" in scripts does NOT hide an unused vite', () => {
	const files = {
		'package.json': JSON.stringify({
			scripts: {
				test: 'vitest run',
			},
			devDependencies: {
				vitest: '^1.0.0',
				vite: '^5.0.0',
			},
		}),
		'src/index.js': 'console.log("app");',
	}

	const result = buildGraph(files)
	assert.equal(result.summary.declaredButUnused.includes('vitest'), false)
	assert.ok(result.summary.declaredButUnused.includes('vite'))
})

test('graph builder: src/components/deep/index.js is orphan-eligible while src/index.js is an entry', () => {
	const files = {
		'src/index.js': 'const x = 1;',
		'src/components/deep/index.js': 'const y = 2;',
	}

	const result = buildGraph(files)
	const srcIndex = result.nodes.find((n) => n.path === 'src/index.js')
	const deepIndex = result.nodes.find((n) => n.path === 'src/components/deep/index.js')

	assert.ok(srcIndex)
	assert.ok(deepIndex)

	assert.equal(srcIndex.isEntry, true)
	assert.equal(srcIndex.isOrphan, false)
	assert.equal(result.summary.orphans.includes('src/index.js'), false)

	assert.equal(deepIndex.isEntry, false)
	assert.equal(deepIndex.isOrphan, true)
	assert.ok(result.summary.orphans.includes('src/components/deep/index.js'))
})

test('graph builder: a *.test.js file has isTest true and is not an orphan', () => {
	const files = {
		'src/index.js': 'const x = 1;',
		'src/utils.test.js': 'const y = 2;',
	}

	const result = buildGraph(files)
	const testNode = result.nodes.find((n) => n.path === 'src/utils.test.js')

	assert.ok(testNode)
	assert.equal(testNode.isTest, true)
	assert.equal(testNode.isOrphan, false)
	assert.equal(result.summary.orphans.includes('src/utils.test.js'), false)
})

test('graph builder: "node ../scripts/x.js" resolves correctly', () => {
	const files = {
		'packages/pkgA/package.json': JSON.stringify({
			name: 'pkg-a',
			scripts: {
				build: 'node ../scripts/x.js',
			},
		}),
		'packages/scripts/x.js': 'console.log("script");',
	}

	const result = buildGraph(files)
	const scriptNode = result.nodes.find((n) => n.path === 'packages/scripts/x.js')

	assert.ok(scriptNode)
	assert.equal(scriptNode.isEntry, true)
	assert.equal(scriptNode.isOrphan, false)
})

