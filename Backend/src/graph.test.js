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
