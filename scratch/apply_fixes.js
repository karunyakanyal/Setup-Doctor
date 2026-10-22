const fs = require('fs');

// 1. Update Backend/src/services/graph.js
let graphCode = fs.readFileSync('Backend/src/services/graph.js', 'utf8');

// Update isNonProductionFile in graph.js
const origNonProd = `	const base = path.posix.basename(clean).toLowerCase()
	if (base.includes('.spec.') || base.includes('.test.')) {
		return true
	}
	return false`;

const newNonProd = `	const base = path.posix.basename(clean).toLowerCase()
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
	return false`;

// Update getNearestPkg in graph.js
const origNearestPkg = `	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0]
	const getNearestPkg = (filePath) => {
		const clean = filePath.replace(/\\\\/g, '/')
		for (const pkgItem of parsedPackageJsons) {
			if (!pkgItem.dir) return pkgItem
			if (clean === pkgItem.dir || clean.startsWith(pkgItem.dir + '/')) {
				return pkgItem
			}
		}
		return rootPkg
	}`;

const newNearestPkg = `	const rootPkg = parsedPackageJsons.find((p) => !p.dir) || parsedPackageJsons[0]
	const nestedPackages = parsedPackageJsons
		.filter((p) => p.dir)
		.sort((a, b) => b.dir.length - a.dir.length)

	const getNearestPkg = (filePath) => {
		const clean = filePath.replace(/\\\\/g, '/')
		for (const pkgItem of nestedPackages) {
			if (clean === pkgItem.dir || clean.startsWith(pkgItem.dir + '/')) {
				return pkgItem
			}
		}
		return rootPkg
	}`;

// Update devDep loop in graph.js to skip config files
const origDevDepLoop = `	for (const node of prodNodes) {
		const pkgItem = getNearestPkg(node.path)
		const devDeps = pkgItem?.content?.devDependencies || {}
		const prodDeps = pkgItem?.content?.dependencies || {}
		const rootProdDeps = rootPkg?.content?.dependencies || {}`;

const newDevDepLoop = `	for (const node of prodNodes) {
		if (node.isConfig || isConfigFile(node.path)) continue
		const pkgItem = getNearestPkg(node.path)
		const devDeps = pkgItem?.content?.devDependencies || {}
		const prodDeps = pkgItem?.content?.dependencies || {}
		const rootProdDeps = rootPkg?.content?.dependencies || {}`;

let normGraph = graphCode.replace(/\r\n/g, '\n');
let normOrigNonProd = origNonProd.replace(/\r\n/g, '\n');
let normNewNonProd = newNonProd.replace(/\r\n/g, '\n');
let normOrigNearest = origNearestPkg.replace(/\r\n/g, '\n');
let normNewNearest = newNearestPkg.replace(/\r\n/g, '\n');
let normOrigDevDep = origDevDepLoop.replace(/\r\n/g, '\n');
let normNewDevDep = newDevDepLoop.replace(/\r\n/g, '\n');

if (!normGraph.includes(normOrigNonProd)) {
  console.error('origNonProd not found in graph.js');
  process.exit(1);
}
if (!normGraph.includes(normOrigNearest)) {
  console.error('origNearestPkg not found in graph.js');
  process.exit(1);
}
if (!normGraph.includes(normOrigDevDep)) {
  console.error('origDevDepLoop not found in graph.js');
  process.exit(1);
}

normGraph = normGraph.replace(normOrigNonProd, normNewNonProd);
normGraph = normGraph.replace(normOrigNearest, normNewNearest);
normGraph = normGraph.replace(normOrigDevDep, normNewDevDep);

if (graphCode.includes('\r\n')) {
  normGraph = normGraph.replace(/\n/g, '\r\n');
}
fs.writeFileSync('Backend/src/services/graph.js', normGraph, 'utf8');
console.log('Successfully updated graph.js');
