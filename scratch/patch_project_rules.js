const fs = require('fs');
const path = require('path');

const prPath = path.resolve(__dirname, '../Backend/src/services/projectRules.js');
let prCode = fs.readFileSync(prPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Patch CORS and unvalidated routes
const oldCorsBlock = `		// 13. Wildcard CORS
		const wildcardCorsEvidence = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\\.[mc]?[jt]sx?$|\\.vue$/.test(filePath)) continue
			const text = fileData.text
			if (
				/cors\\s*\\(\\s*\\{\\s*origin\\s*:\\s*['"]\\*['"]/i.test(text) ||
				/cors\\s*\\(\\s*\\)/.test(text) ||
				/res\\.header\\s*\\(\\s*['"]Access-Control-Allow-Origin['"]\\s*,\\s*['"]\\*['"]\\)/i.test(text) ||
				/res\\.setHeader\\s*\\(\\s*['"]Access-Control-Allow-Origin['"]\\s*,\\s*['"]\\*['"]\\)/i.test(text)
			) {
				const info = findLineAndSnippet(text, 'cors')
				wildcardCorsEvidence.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-wildcard-cors',
				name: 'Wildcard CORS Origin Allowed',
				severity: 'important',
				dimension: 'security',
				why:
					wildcardCorsEvidence.length > 0
						? \`Wildcard CORS origin configured in "\${wildcardCorsEvidence[0].file}", permitting requests from any origin.\`
						: 'CORS origins are properly restricted.',
				fix:
					wildcardCorsEvidence.length > 0
						? \`Restrict CORS origin to trusted domains in "\${wildcardCorsEvidence[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
				evidence: wildcardCorsEvidence,
				count: wildcardCorsEvidence.length,
			})
		)

		// 14. Route handlers with no input validation
		const unvalidatedRoutes = []
		const hasValidationLib =
			Boolean(allDeps.zod) ||
			Boolean(allDeps.joi) ||
			Boolean(allDeps.yup) ||
			Boolean(allDeps['express-validator']) ||
			Boolean(allDeps.celebrate)

		if (!hasValidationLib) {
			for (const r of profile.routes || []) {
				const fileText = filesMap.get(r.file)?.text || ''
				if (
					(fileText.includes('req.body') || fileText.includes('req.query') || fileText.includes('req.params')) &&
					!/validate\\b|schema\\b/i.test(fileText)
				) {
					const info = findLineAndSnippet(fileText, r.path)
					unvalidatedRoutes.push({
						file: r.file,
						line: info.line,
						snippet: info.snippet,
						path: r.path,
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-unvalidated-inputs',
				name: 'Route Handler Without Input Validation',
				severity: 'important',
				dimension: 'security',
				why:
					unvalidatedRoutes.length > 0
						? \`Route handler for "\${unvalidatedRoutes[0].path}" in "\${unvalidatedRoutes[0].file}" parses inputs without schema validation.\`
						: 'Route handlers validate input parameters.',
				fix:
					unvalidatedRoutes.length > 0
						? \`Validate request parameters and body using Zod, Joi, or express-validator in "\${unvalidatedRoutes[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
				evidence: unvalidatedRoutes,
				count: unvalidatedRoutes.length,
			})
		)`;

const newCorsBlock = `		// 13. Wildcard CORS
		const wildcardCorsEvidence = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\\.[mc]?[jt]sx?$|\\.vue$/.test(filePath)) continue
			const text = fileData.text
			if (
				/cors\\s*\\(\\s*\\{\\s*origin\\s*:\\s*['"]\\*['"]/i.test(text) ||
				/cors\\s*\\(\\s*\\)/.test(text) ||
				/res\\.header\\s*\\(\\s*['"]Access-Control-Allow-Origin['"]\\s*,\\s*['"]\\*['"]\\)/i.test(text) ||
				/res\\.setHeader\\s*\\(\\s*['"]Access-Control-Allow-Origin['"]\\s*,\\s*['"]\\*['"]\\)/i.test(text)
			) {
				const lines = text.split(/\\r?\\n/)
				let line = 1
				let snippet = ''
				for (let i = 0; i < lines.length; i++) {
					const l = lines[i]
					if (
						/app\\.use\\s*\\(\\s*cors/i.test(l) ||
						/cors\\s*\\(\\s*(?:\\{\\s*\\}\\s*)?\\)/i.test(l) ||
						/Access-Control-Allow-Origin/i.test(l) ||
						/origin\\s*:\\s*['"]\\*['"]/i.test(l)
					) {
						line = i + 1
						snippet = formatSnippet(l, 120)
						break
					}
				}
				if (!snippet) {
					const info = findLineAndSnippet(text, 'cors')
					line = info.line
					snippet = info.snippet
				}
				wildcardCorsEvidence.push({
					file: filePath,
					line,
					snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-wildcard-cors',
				name: 'Wildcard CORS Origin Allowed',
				severity: 'important',
				dimension: 'security',
				why:
					wildcardCorsEvidence.length > 0
						? \`Wildcard CORS origin configured in "\${wildcardCorsEvidence[0].file}", permitting requests from any origin.\`
						: 'CORS origins are properly restricted.',
				fix:
					wildcardCorsEvidence.length > 0
						? \`Restrict CORS origin to trusted domains in "\${wildcardCorsEvidence[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
				evidence: wildcardCorsEvidence,
				count: wildcardCorsEvidence.length,
			})
		)

		// 14. Route handlers with no input validation
		const unvalidatedRoutes = []
		const unvalidatedPkgs = new Set()
		const hasValidationLib =
			Boolean(allDeps.zod) ||
			Boolean(allDeps.joi) ||
			Boolean(allDeps.yup) ||
			Boolean(allDeps['express-validator']) ||
			Boolean(allDeps.celebrate)

		if (!hasValidationLib) {
			for (const r of profile.routes || []) {
				const fileText = filesMap.get(r.file)?.text || ''
				if (
					(fileText.includes('req.body') || fileText.includes('req.query') || fileText.includes('req.params')) &&
					!/validate\\b|schema\\b/i.test(fileText)
				) {
					unvalidatedRoutes.push({
						file: r.file,
						line: r.line || 1,
						snippet: r.snippet || \`Route \${r.method} \${r.path}\`,
						path: r.path,
					})
					const pkg = getNearestPkg(r.file, parsedPackageJsons)
					unvalidatedPkgs.add(pkg?.path || 'package.json')
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'express-unvalidated-inputs',
				name: 'Route Handler Without Input Validation',
				severity: 'important',
				dimension: 'security',
				why:
					unvalidatedRoutes.length > 0
						? \`Route handler for "\${unvalidatedRoutes[0].path}" in "\${unvalidatedRoutes[0].file}" parses inputs without schema validation.\`
						: 'Route handlers validate input parameters.',
				fix:
					unvalidatedRoutes.length > 0
						? \`Validate request parameters and body using Zod, Joi, or express-validator in "\${unvalidatedRoutes[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
				evidence: unvalidatedRoutes,
				count: unvalidatedPkgs.size,
			})
		)`;

if (prCode.includes(oldCorsBlock)) {
	prCode = prCode.replace(oldCorsBlock, newCorsBlock);
	console.log('Patched CORS and unvalidated routes');
} else {
	console.log('Could not find oldCorsBlock');
}

// 2. Patch React/Vite section
const oldRvSection = `	// React/Vite Rules
	const isReactOrVite = profile.stacks?.includes('react') || profile.stacks?.includes('vite')
	if (isReactOrVite) {
		// 16. Secrets in VITE_ variables
		const viteSecretFindings = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath)) continue
			if (!filePath.startsWith('.env') && !filePath.includes('src/')) continue
			const text = fileData.text || ''
			const viteMatch = text.match(/VITE_[A-Za-z0-9_]*(?:SECRET|PRIVATE|KEY|PASSWORD|TOKEN)[A-Za-z0-9_]*/gi)
			if (viteMatch) {
				for (const vm of viteMatch) {
					const info = findLineAndSnippet(text, vm)
					viteSecretFindings.push({
						file: filePath,
						line: info.line,
						snippet: info.snippet,
						varName: vm,
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'vite-secrets-in-env',
				name: 'Secret Exposed in Client-Side VITE_ Variable',
				severity: 'critical',
				dimension: 'security',
				why:
					viteSecretFindings.length > 0
						? \`Potential secret exposed in client-accessible variable "\${viteSecretFindings[0].varName}" in "\${viteSecretFindings[0].file}".\`
						: 'No client-side VITE_ variables expose private secrets.',
				fix:
					viteSecretFindings.length > 0
						? \`Remove the "VITE_" prefix and keep "\${viteSecretFindings[0].varName}" server-side.\`
						: 'No action required.',
				docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
				evidence: viteSecretFindings,
				count: viteSecretFindings.length,
			})
		)

		// 17. console.log in src
		const consoleLogFindings = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (/\\bconsole\\.log\\s*\\(/.test(text)) {
				const info = findLineAndSnippet(text, 'console.log')
				consoleLogFindings.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'console-log-in-src',
				name: 'console.log Left in Production Source',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					consoleLogFindings.length > 0
						? \`console.log statement found in production file "\${consoleLogFindings[0].file}".\`
						: 'No residual console.log statements in src/.',
				fix:
					consoleLogFindings.length > 0
						? \`Remove console.log from "\${consoleLogFindings[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
				evidence: consoleLogFindings,
				count: consoleLogFindings.length,
			})
		)

		// 18. No error boundary
		let hasErrorBoundary = false
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (
				text.includes('componentDidCatch') ||
				text.includes('getDerivedStateFromError') ||
				text.includes('ErrorBoundary') ||
				text.includes('react-error-boundary')
			) {
				hasErrorBoundary = true
				break
			}
		}
		const noEbCount = hasErrorBoundary ? 0 : 1

		findings.push(
			createRuleResult({
				id: 'react-no-error-boundary',
				name: 'Missing React Error Boundary',
				severity: 'important',
				dimension: 'reliability',
				why:
					noEbCount > 0
						? 'No React Error Boundary detected to gracefully intercept rendering errors.'
						: 'React Error Boundary is implemented.',
				fix:
					noEbCount > 0
						? 'Add a React Error Boundary component (or use \`react-error-boundary\`) wrapping key application views.'
						: 'No action required.',
				docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
				evidence: noEbCount > 0 ? [{ file: 'src/App.jsx', line: 1, snippet: 'Missing ErrorBoundary component' }] : [],
				count: noEbCount,
			})
		)

		// 19. Components over 400 lines
		const largeComponents = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\\.[jt]sx$/.test(filePath)) continue
			const lines = fileData.text.split(/\\r?\\n/)
			if (lines.length > 400) {
				largeComponents.push({
					file: filePath,
					line: 1,
					snippet: \`\${lines.length} lines\`,
					lineCount: lines.length,
				})
			}
		}

		findings.push(
			createRuleResult({
				id: 'react-component-over-400-lines',
				name: 'React Component Exceeds 400 Lines',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					largeComponents.length > 0
						? \`React component "\${largeComponents[0].file}" has \${largeComponents[0].lineCount} lines, exceeding 400 lines.\`
						: 'No React component files exceed 400 lines.',
				fix:
					largeComponents.length > 0
						? \`Extract subcomponents and custom hooks from "\${largeComponents[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://react.dev/learn/thinking-in-react',
				evidence: largeComponents,
				count: largeComponents.length,
			})
		)
	} else {
		// Push inactive React/Vite rules
		findings.push(createRuleResult({
			id: 'vite-secrets-in-env',
			name: 'Secret Exposed in Client-Side VITE_ Variable',
			severity: 'critical',
			dimension: 'security',
			why: 'Project does not use Vite.',
			fix: 'No action required.',
			docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'console-log-in-src',
			name: 'console.log Left in Production Source',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'No console.log statements found in src/.',
			fix: 'No action required.',
			docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'react-no-error-boundary',
			name: 'Missing React Error Boundary',
			severity: 'important',
			dimension: 'reliability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'react-component-over-400-lines',
			name: 'React Component Exceeds 400 Lines',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/learn/thinking-in-react',
			count: 0,
		}))
	}`;

const newRvSection = `	// React and Vite Rules
	const isReact = profile.stacks?.includes('react')
	const isVite = profile.stacks?.includes('vite')

	// 16. Secrets in VITE_ variables (Vite rule)
	if (isVite) {
		const viteSecretFindings = []
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath)) continue
			if (!filePath.startsWith('.env') && !filePath.includes('src/')) continue
			const text = fileData.text || ''
			const viteMatch = text.match(/VITE_[A-Za-z0-9_]*(?:SECRET|PRIVATE|KEY|PASSWORD|TOKEN)[A-Za-z0-9_]*/gi)
			if (viteMatch) {
				for (const vm of viteMatch) {
					const info = findLineAndSnippet(text, vm)
					viteSecretFindings.push({
						file: filePath,
						line: info.line,
						snippet: info.snippet,
						varName: vm,
					})
				}
			}
		}

		findings.push(
			createRuleResult({
				id: 'vite-secrets-in-env',
				name: 'Secret Exposed in Client-Side VITE_ Variable',
				severity: 'critical',
				dimension: 'security',
				why:
					viteSecretFindings.length > 0
						? \`Potential secret exposed in client-accessible variable "\${viteSecretFindings[0].varName}" in "\${viteSecretFindings[0].file}".\`
						: 'No client-side VITE_ variables expose private secrets.',
				fix:
					viteSecretFindings.length > 0
						? \`Remove the "VITE_" prefix and keep "\${viteSecretFindings[0].varName}" server-side.\`
						: 'No action required.',
				docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
				evidence: viteSecretFindings,
				count: viteSecretFindings.length,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'vite-secrets-in-env',
			name: 'Secret Exposed in Client-Side VITE_ Variable',
			severity: 'critical',
			dimension: 'security',
			why: 'Project does not use Vite.',
			fix: 'No action required.',
			docsUrl: 'https://vite.dev/guide/env-and-mode.html#env-variables',
			count: 0,
		}))
	}

	// 17. console.log in src (React or Vite)
	if (isReact || isVite) {
		const consoleLogFindings = []
		const consoleLogPkgs = new Set()
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (/\\bconsole\\.log\\s*\\(/.test(text)) {
				const info = findLineAndSnippet(text, 'console.log')
				consoleLogFindings.push({
					file: filePath,
					line: info.line,
					snippet: info.snippet,
				})
				const pkg = getNearestPkg(filePath, parsedPackageJsons)
				consoleLogPkgs.add(pkg?.path || 'package.json')
			}
		}

		findings.push(
			createRuleResult({
				id: 'console-log-in-src',
				name: 'console.log Left in Production Source',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					consoleLogFindings.length > 0
						? \`console.log statement found in production file "\${consoleLogFindings[0].file}".\`
						: 'No residual console.log statements in src/.',
				fix:
					consoleLogFindings.length > 0
						? \`Remove console.log from "\${consoleLogFindings[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
				evidence: consoleLogFindings,
				count: consoleLogPkgs.size,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'console-log-in-src',
			name: 'console.log Left in Production Source',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'No console.log statements found in src/.',
			fix: 'No action required.',
			docsUrl: 'https://eslint.org/docs/latest/rules/no-console',
			count: 0,
		}))
	}

	// 18. Missing React Error Boundary (ONLY React projects)
	if (isReact) {
		let hasErrorBoundary = false
		for (const [filePath, fileData] of filesMap.entries()) {
			if (isNonProductionFile(filePath) || !fileData.text) continue
			const text = fileData.text
			if (
				text.includes('componentDidCatch') ||
				text.includes('getDerivedStateFromError') ||
				text.includes('ErrorBoundary') ||
				text.includes('react-error-boundary')
			) {
				hasErrorBoundary = true
				break
			}
		}
		const noEbCount = hasErrorBoundary ? 0 : 1

		findings.push(
			createRuleResult({
				id: 'react-no-error-boundary',
				name: 'Missing React Error Boundary',
				severity: 'important',
				dimension: 'reliability',
				why:
					noEbCount > 0
						? 'No React Error Boundary detected to gracefully intercept rendering errors.'
						: 'React Error Boundary is implemented.',
				fix:
					noEbCount > 0
						? 'Add a React Error Boundary component (or use \`react-error-boundary\`) wrapping key application views.'
						: 'No action required.',
				docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
				evidence: noEbCount > 0 ? [{ file: 'src/App.jsx', line: 1, snippet: 'Missing ErrorBoundary component' }] : [],
				count: noEbCount,
			})
		)

		// 19. React Components over 400 lines (ONLY React projects)
		const largeComponents = []
		const largeComponentPkgs = new Set()
		for (const [filePath, fileData] of filesMap.entries()) {
			if (!filePath.startsWith('src/') || isNonProductionFile(filePath) || !fileData.text) continue
			if (!/\\.[jt]sx$/.test(filePath)) continue
			const lines = fileData.text.split(/\\r?\\n/)
			if (lines.length > 400) {
				largeComponents.push({
					file: filePath,
					line: 1,
					snippet: \`\${lines.length} lines\`,
					lineCount: lines.length,
				})
				const pkg = getNearestPkg(filePath, parsedPackageJsons)
				largeComponentPkgs.add(pkg?.path || 'package.json')
			}
		}

		findings.push(
			createRuleResult({
				id: 'react-component-over-400-lines',
				name: 'React Component Exceeds 400 Lines',
				severity: 'nice-to-have',
				dimension: 'maintainability',
				why:
					largeComponents.length > 0
						? \`React component "\${largeComponents[0].file}" has \${largeComponents[0].lineCount} lines, exceeding 400 lines.\`
						: 'No React component files exceed 400 lines.',
				fix:
					largeComponents.length > 0
						? \`Extract subcomponents and custom hooks from "\${largeComponents[0].file}".\`
						: 'No action required.',
				docsUrl: 'https://react.dev/learn/thinking-in-react',
				evidence: largeComponents,
				count: largeComponentPkgs.size,
			})
		)
	} else {
		findings.push(createRuleResult({
			id: 'react-no-error-boundary',
			name: 'Missing React Error Boundary',
			severity: 'important',
			dimension: 'reliability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
			count: 0,
		}))
		findings.push(createRuleResult({
			id: 'react-component-over-400-lines',
			name: 'React Component Exceeds 400 Lines',
			severity: 'nice-to-have',
			dimension: 'maintainability',
			why: 'Project does not use React.',
			fix: 'No action required.',
			docsUrl: 'https://react.dev/learn/thinking-in-react',
			count: 0,
		}))
	}`;

if (prCode.includes(oldRvSection)) {
	prCode = prCode.replace(oldRvSection, newRvSection);
	console.log('Patched React/Vite section');
} else {
	console.log('Could not find oldRvSection');
}

fs.writeFileSync(prPath, prCode, 'utf8');
console.log('Saved projectRules.js');
