const assert = require('node:assert/strict')
const test = require('node:test')
const { buildGraph } = require('./services/graph')
const { createRuleResult } = require('./services/ruleEngine')

test('Phase 1: Rule engine fields check (id, name, severity, dimension, why, fix, docsUrl, evidence, count, more)', () => {
	const rule = createRuleResult({
		id: 'test-rule',
		name: 'Test Rule',
		severity: 'critical',
		dimension: 'reliability',
		why: 'File "src/index.js" triggered test rule.',
		fix: 'Fix "src/index.js".',
		docsUrl: 'https://example.com/docs',
		evidence: [
			{ file: 'src/index.js', line: 10, snippet: 'const a = 1;' },
			{ file: 'src/index.js', line: 11, snippet: 'const b = 2;' },
			{ file: 'src/index.js', line: 12, snippet: 'const c = 3;' },
			{ file: 'src/index.js', line: 13, snippet: 'const d = 4;' }, // should be capped at 3
		],
		count: 15,
	})

	assert.equal(rule.id, 'test-rule')
	assert.equal(rule.name, 'Test Rule')
	assert.equal(rule.severity, 'critical')
	assert.equal(rule.dimension, 'reliability')
	assert.equal(rule.why, 'File "src/index.js" triggered test rule.')
	assert.equal(rule.fix, 'Fix "src/index.js".')
	assert.equal(rule.docsUrl, 'https://example.com/docs')
	assert.equal(rule.count, 15)
	assert.equal(rule.evidence.length, 3)
	assert.equal(rule.more, '+5 more')
})

test('Phase 1: Unused dependency accuracy - config files (webpack, rollup) and CI files mark deps as used', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'config-ci-test',
			dependencies: {
				'webpack-bundle-analyzer': '^4.5.0',
				'@rollup/plugin-commonjs': '^25.0.0',
				'ci-reporter': '^1.0.0',
				'truly-unused': '^1.0.0',
			},
		}),
		'webpack.config.js': `const Analyzer = require('webpack-bundle-analyzer'); module.exports = {};`,
		'rollup.config.js': `import commonjs from '@rollup/plugin-commonjs'; export default {};`,
		'.github/workflows/test.yml': `
name: CI
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npx ci-reporter
`,
		'src/index.js': `console.log("hello world");`,
	}

	const result = buildGraph(files)
	assert.equal(result.summary.declaredButUnused.includes('webpack-bundle-analyzer'), false)
	assert.equal(result.summary.declaredButUnused.includes('@rollup/plugin-commonjs'), false)
	assert.equal(result.summary.declaredButUnused.includes('ci-reporter'), false)
	assert.equal(result.summary.declaredButUnused.includes('truly-unused'), true)
})

test('Phase 1: Unused dependency accuracy - @types/* packages for used packages count as used, for unused count as unused', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'types-test',
			dependencies: {
				express: '^4.18.2',
			},
			devDependencies: {
				'@types/express': '^4.17.21',
				'@types/unused-lib': '^1.0.0',
				'@types/node': '^20.0.0',
			},
		}),
		'src/index.js': `import express from 'express';`,
	}

	const result = buildGraph(files)
	// @types/express is for express (which is used) -> not unused
	assert.equal(result.summary.declaredButUnused.includes('@types/express'), false)
	// @types/node is for node built-in -> not unused
	assert.equal(result.summary.declaredButUnused.includes('@types/node'), false)
	// @types/unused-lib is for unused-lib (which is NOT used anywhere) -> must be flagged unused
	assert.equal(result.summary.declaredButUnused.includes('@types/unused-lib'), true)
})

test('Phase 1: Unused dependency accuracy - known plugins/presets of used tools count as used', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'plugin-preset-test',
			devDependencies: {
				eslint: '^8.0.0',
				'eslint-plugin-react': '^7.30.0',
				'babel-preset-env': '^1.7.0',
			},
			scripts: {
				lint: 'eslint .',
			},
		}),
		'src/index.js': `console.log("clean");`,
	}

	const result = buildGraph(files)
	// eslint is used in scripts
	assert.equal(result.summary.declaredButUnused.includes('eslint'), false)
	// eslint-plugin-react is a known plugin of eslint -> not unused
	assert.equal(result.summary.declaredButUnused.includes('eslint-plugin-react'), false)
	// babel-preset-env is a preset of babel, but babel is NOT used -> flagged unused
	assert.equal(result.summary.declaredButUnused.includes('babel-preset-env'), true)
})

test('Phase 1: Dependency rules - production code importing a devDependency', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'dev-dep-import-test',
			dependencies: {
				express: '^4.18.2',
			},
			devDependencies: {
				nodemon: '^3.0.0',
			},
		}),
		'src/app.js': `
			import express from 'express';
			import nodemon from 'nodemon';
			console.log(express, nodemon);
		`,
	}

	const result = buildGraph(files)
	const devDepRule = result.summary.rules.find((r) => r.id === 'dev-dependency-in-production')
	assert.ok(devDepRule, 'dev-dependency-in-production rule must exist')
	assert.equal(devDepRule.count, 1)
	assert.equal(devDepRule.severity, 'important')
	assert.equal(devDepRule.dimension, 'reliability')
	assert.ok(devDepRule.why.includes('src/app.js'))
	assert.ok(devDepRule.why.includes('nodemon'))
	assert.ok(devDepRule.fix.includes('nodemon'))
	assert.equal(devDepRule.evidence.length, 1)
	assert.equal(devDepRule.evidence[0].file, 'src/app.js')
})

test('Phase 1: Dependency rules - a package in both dependencies and devDependencies', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'dup-deps-test',
			dependencies: {
				lodash: '^4.17.21',
			},
			devDependencies: {
				lodash: '^4.17.21',
			},
		}),
		'src/index.js': `import lodash from 'lodash'; console.log(lodash);`,
	}

	const result = buildGraph(files)
	const dupRule = result.summary.rules.find((r) => r.id === 'duplicate-dependencies')
	assert.ok(dupRule, 'duplicate-dependencies rule must exist')
	assert.equal(dupRule.count, 1)
	assert.equal(dupRule.severity, 'important')
	assert.equal(dupRule.dimension, 'hygiene')
	assert.ok(dupRule.why.includes('lodash'))
	assert.ok(dupRule.fix.includes('lodash'))
})

test('Phase 1: Dependency rules - import resolves to nothing (excluding build outputs like ./dist)', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'unresolved-test',
		}),
		'src/index.js': `
			import { missing } from './doesNotExist.js';
			import './dist/bundle.js';
		`,
	}

	const result = buildGraph(files)
	const rule = result.summary.rules.find((r) => r.id === 'unresolved-imports')
	assert.ok(rule)
	assert.equal(rule.count, 1) // ./dist/bundle.js is excluded as build output
	assert.ok(rule.why.includes('./doesNotExist.js'))
	assert.equal(rule.evidence[0].file, 'src/index.js')
})

test('Phase 1: Root-cause grouping - unused file explains exports and exclusive dependencies', () => {
	const files = {
		'package.json': JSON.stringify({
			name: 'root-cause-test',
			dependencies: {
				'exclusive-pkg': '^1.0.0',
				'shared-pkg': '^1.0.0',
			},
		}),
		'src/index.js': `
			import { shared } from 'shared-pkg';
			console.log(shared);
		`,
		// Orphan file that is never imported
		'src/orphanModule.js': `
			import { exclusive } from 'exclusive-pkg';
			import { shared } from 'shared-pkg';
			export const helperA = 1;
			export function helperB() { return exclusive; }
			export default function main() {}
		`,
	}

	const result = buildGraph(files)
	const orphansRule = result.summary.rules.find((r) => r.id === 'orphans')
	assert.ok(orphansRule)
	assert.equal(orphansRule.count, 1)
	assert.ok(orphansRule.children && orphansRule.children.length === 1)
	const child = orphansRule.children[0]
	assert.equal(child.file, 'src/orphanModule.js')
	// helperA, helperB, default -> 3 exports
	assert.equal(child.exportsCount, 3)
	// exclusive-pkg is only imported by orphanModule.js -> 1 exclusive dependency
	assert.equal(child.dependenciesCount, 1)
	assert.deepEqual(child.dependencies, ['exclusive-pkg'])
	assert.equal(child.summary, '1 unused file explains 3 exports and 1 dependency')
	assert.ok(orphansRule.why.includes('1 unused file explains 3 exports and 1 dependency'))
})
