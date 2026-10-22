const path = require('path')

/**
 * Format snippet to single line and cap at maxLen characters.
 */
function formatSnippet(str, maxLen = 120) {
	if (!str) return ''
	const oneLine = str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
	return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 3) + '...' : oneLine
}

/**
 * Extract named and default exports from source code.
 */
function extractExports(sourceCode) {
	if (!sourceCode || typeof sourceCode !== 'string') return []
	const exports = new Set()
	if (/export\s+default\b/.test(sourceCode)) {
		exports.add('default')
	}
	const declRegex = /export\s+(?:const|let|var|function\*?|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g
	let match
	while ((match = declRegex.exec(sourceCode)) !== null) {
		exports.add(match[1])
	}
	const namedRegex = /export\s*\{([^}]+)\}/g
	while ((match = namedRegex.exec(sourceCode)) !== null) {
		const parts = match[1].split(',')
		for (const part of parts) {
			const clean = part.trim()
			if (!clean) continue
			const asMatch = clean.match(/(?:type\s+)?([a-zA-Z0-9_$]+)(?:\s+as\s+([a-zA-Z0-9_$]+))?/)
			if (asMatch) {
				exports.add(asMatch[2] || asMatch[1])
			}
		}
	}
	const cjsRegex = /(?:module\.)?exports\.([a-zA-Z0-9_$]+)\s*=/g
	while ((match = cjsRegex.exec(sourceCode)) !== null) {
		exports.add(match[1])
	}
	if (/module\.exports\s*=/.test(sourceCode) && !exports.has('default')) {
		exports.add('default')
	}
	return Array.from(exports)
}

/**
 * Find 1-based line number and snippet for a target string in file text.
 */
function findLineAndSnippet(fileText, target) {
	if (!fileText || !target) return { line: 1, snippet: String(target || '') }
	const lines = fileText.split(/\r?\n/)
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(target)) {
			return {
				line: i + 1,
				snippet: formatSnippet(lines[i], 120),
			}
		}
	}
	return { line: 1, snippet: formatSnippet(lines[0] || target, 120) }
}

/**
 * Standard rule object factory ensuring all required fields:
 * id, name, severity, dimension, why, fix, docsUrl, evidence[], count, +N more when over 10.
 */
function createRuleResult({
	id,
	name,
	severity = 'important',
	dimension = 'reliability',
	why,
	fix,
	docsUrl,
	evidence = [],
	count = 0,
	children = [],
	examples = [],
	affectedExamples = [],
	more = null,
}) {
	const finalEvidence = evidence.slice(0, 3).map((e) => ({
		file: e.file || '',
		line: typeof e.line === 'number' ? e.line : 1,
		snippet: formatSnippet(e.snippet || '', 120),
	}))

	const totalCount = typeof count === 'number' ? count : finalEvidence.length
	const moreText = totalCount > 10 ? `+${totalCount - 10} more` : null

	const finalExamples = examples.length > 0 ? examples.slice(0, 3) : finalEvidence.map((e) => e.file)

	return {
		id,
		name,
		severity,
		dimension,
		why: why || `Check ${name} passed with 0 issues.`,
		fix: fix || `No action required.`,
		docsUrl: docsUrl || 'https://docs.npmjs.com/',
		evidence: finalEvidence,
		count: totalCount,
		more: more || moreText,
		children: children || [],
		examples: finalExamples,
		affectedExamples: affectedExamples.length > 0 ? affectedExamples.slice(0, 3) : finalExamples,
	}
}

module.exports = {
	formatSnippet,
	extractExports,
	findLineAndSnippet,
	createRuleResult,
}
