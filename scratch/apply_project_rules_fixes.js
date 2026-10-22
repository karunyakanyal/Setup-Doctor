const fs = require('fs');

let code = fs.readFileSync('Backend/src/services/projectRules.js', 'utf8');
let norm = code.replace(/\r\n/g, '\n');

// 1. In extractProjectProfile
const origProfileStacks = `	// Express
	if (
		allDeps.express ||
		allFilePaths.some((f) => {
			const text = filesMap.get(f)?.text || ''
			return text.includes("require('express')") || text.includes('from "express"') || text.includes("from 'express'")
		})
	) {
		stacks.add('express')
	}
	// React
	if (
		allDeps.react ||
		allFilePaths.some((f) => /\\.jsx$|\\.tsx$/.test(f)) ||
		allFilePaths.some((f) => {
			const text = filesMap.get(f)?.text || ''
			return text.includes("from 'react'") || text.includes('from "react"')
		})
	) {
		stacks.add('react')
	}
	// Vite
	if (
		allDeps.vite ||
		allFilePaths.some((f) => f.includes('vite.config.'))
	) {
		stacks.add('vite')
	}
	// Python
	if (
		filesMap.has('requirements.txt') ||
		filesMap.has('pyproject.toml') ||
		filesMap.has('Pipfile') ||
		allFilePaths.some((f) => f.endsWith('.py'))
	) {
		stacks.add('python')
	}
	// Django
	if (
		filesMap.has('manage.py') ||
		allFilePaths.some((f) => {
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
			const text = filesMap.get(f)?.text || ''
			return text.includes('import fastapi') || text.includes('from fastapi')
		})
	) {
		stacks.add('fastapi')
		stacks.add('python')
	}`;

const newProfileStacks = `	// Express
	if (
		allDeps.express ||
		allFilePaths.some((f) => {
			if (isNonProductionFile(f)) return false
			const text = filesMap.get(f)?.text || ''
			return text.includes("require('express')") || text.includes('from "express"') || text.includes("from 'express'")
		})
	) {
		stacks.add('express')
	}
	// React
	if (
		allDeps.react ||
		allFilePaths.some((f) => !isNonProductionFile(f) && (/\\.jsx$|\\.tsx$/.test(f) || (filesMap.get(f)?.text?.includes("from 'react'") || filesMap.get(f)?.text?.includes('from "react"'))))
	) {
		stacks.add('react')
	}
	// Vite
	if (
		allDeps.vite ||
		allFilePaths.some((f) => f.includes('vite.config.'))
	) {
		stacks.add('vite')
	}
	// Python
	if (
		filesMap.has('requirements.txt') ||
		filesMap.has('pyproject.toml') ||
		filesMap.has('Pipfile') ||
		allFilePaths.some((f) => !isNonProductionFile(f) && f.endsWith('.py'))
	) {
		stacks.add('python')
	}
	// Django
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

// 2. In env-file-tracked
const origTrackedEnv = `	// 2. Universal: .env tracked by git
	const trackedEnvFiles = allFilePaths.filter((f) => {
		const base = path.posix.basename(f).toLowerCase()
		if (base === '.env' || base.startsWith('.env.')) {
			if (base === '.env.example' || base === '.env.sample' || base === '.env.template') {
				return false
			}
			return true
		}
		return false
	})`;

const newTrackedEnv = `	// 2. Universal: .env tracked by git
	const trackedEnvFiles = allFilePaths.filter((f) => {
		if (isNonProductionFile(f)) return false
		const base = path.posix.basename(f).toLowerCase()
		if (base === '.env' || base.startsWith('.env.')) {
			if (base === '.env.example' || base === '.env.sample' || base === '.env.template') {
				return false
			}
			return true
		}
		return false
	})`;

// 3. In express-wildcard-cors: only check code files
const origCors = `		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text`;

const newCors = `		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\\.[mc]?[jt]sx?$|\\.vue$/.test(filePath)) continue
			const text = fileData.text`;

// 4. In vite-secrets-in-env: skip non-production files
const origViteSec = `		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('.env') && !filePath.includes('src/')) continue`;

const newViteSec = `		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath)) continue
			if (!filePath.startsWith('.env') && !filePath.includes('src/')) continue`;

if (!norm.includes(origProfileStacks)) {
  console.error('origProfileStacks not found');
  process.exit(1);
}
if (!norm.includes(origTrackedEnv)) {
  console.error('origTrackedEnv not found');
  process.exit(1);
}
if (!norm.includes(origCors)) {
  console.error('origCors not found');
  process.exit(1);
}
if (!norm.includes(origViteSec)) {
  console.error('origViteSec not found');
  process.exit(1);
}

norm = norm.replace(origProfileStacks, newProfileStacks);
norm = norm.replace(origTrackedEnv, newTrackedEnv);
norm = norm.replace(origCors, newCors);
norm = norm.replace(origViteSec, newViteSec);

if (code.includes('\r\n')) {
  norm = norm.replace(/\n/g, '\r\n');
}
fs.writeFileSync('Backend/src/services/projectRules.js', norm, 'utf8');
console.log('Successfully updated projectRules.js');
