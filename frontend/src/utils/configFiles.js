/**
 * Shared configuration tools and detection helper for SetupDoctor frontend.
 * Matches the backend tool configuration rules.
 */
export const CONFIG_TOOLS = [
  'eslint',
  'vite',
  'webpack',
  'rollup',
  'tailwind',
  'postcss',
  'babel',
  'jest',
  'vitest',
  'prettier',
  'tsconfig',
]

/**
 * Checks whether a file path corresponds to a configuration file.
 * Handles .vitepress/config.*, *.config.*, tsconfig.*.json, dotfiles, rc files.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isConfigFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const clean = filePath.replace(/\\/g, '/')
  const parts = clean.split('/')
  const base = parts[parts.length - 1]?.toLowerCase() || ''

  // .vitepress/config.* or vitepress configs
  if (clean.includes('.vitepress/config.') || clean.startsWith('.vitepress/config.')) {
    return true
  }

  // *.config.* (e.g. vite.config.js, tailwind.config.ts, webpack.config.js, rollup.config.mjs)
  if (base.includes('.config.')) {
    return true
  }

  // tsconfig*.json
  if (base.startsWith('tsconfig') && (base.endsWith('.json') || base.includes('.json'))) {
    return true
  }

  // rc or dotfile configs for known tooling packages
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
