import test from 'node:test'
import assert from 'node:assert/strict'
import { isConfigFile, CONFIG_TOOLS } from './configFiles.js'

test('configFiles: identifies tool and bundler config files correctly', () => {
  // .vitepress/config.*
  assert.equal(isConfigFile('.vitepress/config.js'), true)
  assert.equal(isConfigFile('docs/.vitepress/config.ts'), true)
  assert.equal(isConfigFile('.vitepress/config.mts'), true)

  // *.config.*
  assert.equal(isConfigFile('vite.config.js'), true)
  assert.equal(isConfigFile('vite.config.ts'), true)
  assert.equal(isConfigFile('webpack.config.js'), true)
  assert.equal(isConfigFile('rollup.config.mjs'), true)
  assert.equal(isConfigFile('tailwind.config.cjs'), true)
  assert.equal(isConfigFile('postcss.config.js'), true)
  assert.equal(isConfigFile('jest.config.ts'), true)
  assert.equal(isConfigFile('vitest.config.ts'), true)

  // tsconfig
  assert.equal(isConfigFile('tsconfig.json'), true)
  assert.equal(isConfigFile('tsconfig.node.json'), true)
  assert.equal(isConfigFile('tsconfig.build.json'), true)

  // rc files and dotfiles
  assert.equal(isConfigFile('.eslintrc'), true)
  assert.equal(isConfigFile('.eslintrc.json'), true)
  assert.equal(isConfigFile('.eslintrc.js'), true)
  assert.equal(isConfigFile('.prettierrc'), true)
  assert.equal(isConfigFile('.prettierrc.json'), true)
  assert.equal(isConfigFile('prettier.config.js'), true)
  assert.equal(isConfigFile('.babelrc'), true)

  // Regular source files return false
  assert.equal(isConfigFile('src/main.js'), false)
  assert.equal(isConfigFile('src/utils/config.js'), false)
  assert.equal(isConfigFile('packages/core/src/index.ts'), false)
  assert.equal(isConfigFile(''), false)
  assert.equal(isConfigFile(null), false)
})

test('configFiles: exports required tools list', () => {
  assert.ok(Array.isArray(CONFIG_TOOLS))
  assert.ok(CONFIG_TOOLS.includes('vite'))
  assert.ok(CONFIG_TOOLS.includes('webpack'))
  assert.ok(CONFIG_TOOLS.includes('rollup'))
  assert.ok(CONFIG_TOOLS.includes('eslint'))
  assert.ok(CONFIG_TOOLS.includes('prettier'))
  assert.ok(CONFIG_TOOLS.includes('tsconfig'))
  assert.ok(CONFIG_TOOLS.includes('jest'))
  assert.ok(CONFIG_TOOLS.includes('vitest'))
})
