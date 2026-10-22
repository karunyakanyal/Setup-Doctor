const fs = require('fs');

let code = fs.readFileSync('Backend/src/services/projectRules.js', 'utf8');
let norm = code.replace(/\r\n/g, '\n');

const origExpress = `	// Express
	if (
		allDeps.express ||
		allFilePaths.some((f) => {
			if (isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return text.includes("require('express')") || text.includes('from "express"') || text.includes("from 'express'")
		})
	) {
		stacks.add('express')
	}`;

const newExpress = `	// Express
	if (
		allDeps.express ||
		allFilePaths.some((f) => {
			if (!/\\.[mc]?[jt]sx?$|\\.vue$/.test(f) || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /(?:const|let|var)\\s+\\w+\\s*=\\s*require\\s*\\(\\s*['"]express['"]\\s*\\)|from\\s+['"]express['"]/.test(text)
		})
	) {
		stacks.add('express')
	}`;

const origPythonStacks = `	// Django
	if (
		filesMap.has('manage.py') ||
		allFilePaths.some((f) => {
			if (isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return text.includes('import django') || text.includes('from django')
		})
	) {
		stacks.add('django')
		stacks.add('python')
	}
	// Flask
	if (
		allFilePaths.some((f) => {
			if (isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return text.includes('import flask') || text.includes('from flask')
		})
	) {
		stacks.add('flask')
		stacks.add('python')
	}
	// FastAPI
	if (
		allFilePaths.some((f) => {
			if (isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return text.includes('import fastapi') || text.includes('from fastapi')
		})
	) {
		stacks.add('fastapi')
		stacks.add('python')
	}`;

const newPythonStacks = `	// Django
	if (
		filesMap.has('manage.py') ||
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\\bimport\\s+django\\b|\\bfrom\\s+django\\b/.test(text)
		})
	) {
		stacks.add('django')
		stacks.add('python')
	}
	// Flask
	if (
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\\bimport\\s+flask\\b|\\bfrom\\s+flask\\b/.test(text)
		})
	) {
		stacks.add('flask')
		stacks.add('python')
	}
	// FastAPI
	if (
		allFilePaths.some((f) => {
			if (!f.endsWith('.py') || isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return /\\bimport\\s+fastapi\\b|\\bfrom\\s+fastapi\\b/.test(text)
		})
	) {
		stacks.add('fastapi')
		stacks.add('python')
	}`;

if (!norm.includes(origExpress)) {
  console.error('origExpress not found');
  process.exit(1);
}
if (!norm.includes(origPythonStacks)) {
  console.error('origPythonStacks not found');
  process.exit(1);
}

norm = norm.replace(origExpress, newExpress);
norm = norm.replace(origPythonStacks, newPythonStacks);

if (code.includes('\r\n')) {
  norm = norm.replace(/\n/g, '\r\n');
}
fs.writeFileSync('Backend/src/services/projectRules.js', norm, 'utf8');
console.log('Successfully updated projectRules.js with clean stack detection');
