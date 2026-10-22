const fs = require('fs');
const path = require('path');

// 1. Patch graph.js
const graphPath = path.resolve(__dirname, '../Backend/src/services/graph.js');
let graphCode = fs.readFileSync(graphPath, 'utf8').replace(/\r\n/g, '\n');

// Patch 1: findClosingImportLine in runtime-cycles
const oldCycleEvidence = `	const cycleEvidence = []
	for (const cycle of runtimeCyclesList.slice(0, 3)) {
		const shortest = (Array.isArray(cycle.shortest) && cycle.shortest.length > 0)
			? cycle.shortest
			: (Array.isArray(cycle) ? cycle : (cycle.files || []))
		const f1 = shortest[0] || 'src'
		const f2 = shortest[1] || shortest[0]
		const info = findLineAndSnippet(filesMap.get(f1)?.text, path.posix.basename(f2))
		cycleEvidence.push({ file: f1, line: info.line, snippet: info.snippet || \`import from \${f2}\` })
	}`;

const newCycleEvidence = `	function findClosingImportLine(fromFile, targetFile) {
		const fileText = filesMap.get(fromFile)?.text || ''
		if (!fileText) return { file: fromFile, line: 1, snippet: '' }
		const targetBase = path.posix.basename(targetFile, path.posix.extname(targetFile))
		const lines = fileText.split(/\\r?\\n/)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (
				(/\\bimport\\b|\\brequire\\b/.test(line)) &&
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
				(/\\bfrom\\s*['"][^'"]*['"]/.test(line) || /require\\s*\\(['"][^'"]*['"]\\)/.test(line)) &&
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
	}`;

if (graphCode.includes(oldCycleEvidence)) {
	graphCode = graphCode.replace(oldCycleEvidence, newCycleEvidence);
	console.log('Patched graph.js: cycleEvidence');
} else {
	console.log('Could not find oldCycleEvidence in graph.js');
}

// Patch 2: dev-dependency-in-production (isBundledPackage + count per package)
const oldDevDep = `	// 4. Production code importing devDependencies
	const devDepFindings = []
	for (const node of prodNodes) {
		if (node.isConfig || isConfigFile(node.path)) continue
		const pkgItem = getNearestPkg(node.path)
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
					devDepFindings.push({
						file: node.path,
						pkg: norm,
						line: info.line,
						snippet: info.snippet,
						pkgPath: pkgItem?.path || 'package.json',
					})
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
		? \`Production file "\${devDepFindings[0].file}" imports package "\${devDepFindings[0].pkg}", which is declared in devDependencies.\`
		: 'No devDependencies are imported by production code.'
	const devDepFix = devDepFindings.length > 0
		? \`Move "\${devDepFindings[0].pkg}" from devDependencies to dependencies in \${devDepFindings[0].pkgPath}.\`
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
		count: devDepFindings.length,
		examples: devDepFindings.slice(0, 3).map((f) => \`\${f.pkg} in \${f.file}\`),
		affectedExamples: devDepFindings.slice(0, 3).map((f) => \`\${f.pkg} in \${f.file}\`),
	})`;

const newDevDep = `	// 4. Production code importing devDependencies
	function isBundledPackage(pkgItem) {
		if (!pkgItem) return false
		const content = pkgItem.content || {}
		const scripts = content.scripts || {}
		const deps = { ...(content.dependencies || {}), ...(content.devDependencies || {}) }

		const BUNDLER_PATTERNS = [/\\btsdown\\b/i, /\\brolldown\\b/i, /\\besbuild\\b/i, /\\bwebpack\\b/i, /\\brollup\\b/i, /\\bvite\\s+build\\b/i]
		for (const sVal of Object.values(scripts)) {
			if (typeof sVal === 'string' && BUNDLER_PATTERNS.some((pat) => pat.test(sVal))) {
				return true
			}
		}
		const BUNDLER_PACKAGES = ['tsdown', 'rolldown', 'esbuild', 'webpack', 'rollup', 'vite']
		for (const bp of BUNDLER_PACKAGES) {
			if (deps[bp]) return true
		}
		const pkgDir = pkgItem.dir ? \`\${pkgItem.dir}/\` : ''
		const CONFIG_PATTERNS = [
			/^vite\\.config\\.[mc]?[jt]s$/,
			/^rollup\\.config\\.[mc]?[jt]s$/,
			/^webpack\\.config\\.[mc]?[jt]s$/,
			/^esbuild\\.[mc]?[jt]s$/,
			/^tsdown\\.config\\.[mc]?[jt]s$/,
			/^rolldown\\.config\\.[mc]?[jt]s$/,
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
		? \`Production file "\${devDepFindings[0].file}" imports package "\${devDepFindings[0].pkg}", which is declared in devDependencies.\`
		: 'No devDependencies are imported by production code.'
	const devDepFix = devDepFindings.length > 0
		? \`Move "\${devDepFindings[0].pkg}" from devDependencies to dependencies in \${devDepFindings[0].pkgPath}.\`
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
		examples: devDepFindings.slice(0, 3).map((f) => \`\${f.pkg} in \${f.file}\`),
		affectedExamples: devDepFindings.slice(0, 3).map((f) => \`\${f.pkg} in \${f.file}\`),
	})`;

if (graphCode.includes(oldDevDep)) {
	graphCode = graphCode.replace(oldDevDep, newDevDep);
	console.log('Patched graph.js: devDepRule');
} else {
	console.log('Could not find oldDevDep in graph.js');
}

// Patch 3: unused-dependencies (attribute to nearest package.json + find line in package.json)
const oldUnusedDeps = `	// 7. Unused dependencies
	const unusedDepsEvidence = []
	for (const dep of declaredButUnused.slice(0, 3)) {
		const pkgPath = rootPkg?.path || 'package.json'
		const info = findLineAndSnippet(filesMap.get(pkgPath)?.text, dep)
		unusedDepsEvidence.push({
			file: pkgPath,
			line: info.line,
			snippet: info.snippet,
		})
	}`;

const newUnusedDeps = `	// 7. Unused dependencies
	const unusedDepsEvidence = []
	for (const dep of declaredButUnused.slice(0, 3)) {
		let declaringPkg = parsedPackageJsons.find((pkg) => {
			const deps = pkg.content?.dependencies || {}
			const devDeps = pkg.content?.devDependencies || {}
			return Object.prototype.hasOwnProperty.call(deps, dep) || Object.prototype.hasOwnProperty.call(devDeps, dep)
		}) || rootPkg
		const pkgPath = declaringPkg?.path || 'package.json'
		const pkgText = filesMap.get(pkgPath)?.text || ''
		const info = findLineAndSnippet(pkgText, \`"\${dep}"\`)
		unusedDepsEvidence.push({
			file: pkgPath,
			line: info.line,
			snippet: info.snippet,
		})
	}`;

if (graphCode.includes(oldUnusedDeps)) {
	graphCode = graphCode.replace(oldUnusedDeps, newUnusedDeps);
	console.log('Patched graph.js: unusedDepsEvidence');
} else {
	console.log('Could not find oldUnusedDeps in graph.js');
}

// Patch 4: missing-tests dimension -> maintainability
const oldMissingTestsDim = `	const missingTestsRule = createRuleResult({
		id: 'missing-tests',
		name: 'Missing Test Script or Test Files',
		severity: 'important',
		dimension: 'reliability',`;

const newMissingTestsDim = `	const missingTestsRule = createRuleResult({
		id: 'missing-tests',
		name: 'Missing Test Script or Test Files',
		severity: 'important',
		dimension: 'maintainability',`;

if (graphCode.includes(oldMissingTestsDim)) {
	graphCode = graphCode.replace(oldMissingTestsDim, newMissingTestsDim);
	console.log('Patched graph.js: missingTests dimension');
} else {
	console.log('Could not find oldMissingTestsDim in graph.js');
}

fs.writeFileSync(graphPath, graphCode, 'utf8');
console.log('Saved graph.js');
