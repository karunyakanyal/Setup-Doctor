const {
	getMajorVersion,
	isValidDependencyVersion,
	normalizeContext,
	isIgnoredPath,
	isCandidateEnvFile,
	formatList,
	IGNORED_PATH_SEGMENTS,
	hasEnvironmentUsage,
} = require('./utils')
const { detectFramework } = require('./framework')

// 22 Existing rules
const packageJsonRule = require('./package-json')
const scriptsRule = require('./scripts')
const buildScriptRule = require('./build-script')
const devScriptRule = require('./dev-script')
const dependenciesRule = require('./dependencies')
const nodeEngineRule = require('./node-engine')
const dependencyCountRule = require('./dependency-count')
const duplicateDependenciesRule = require('./duplicate-dependencies')
const dependencyVersionValidityRule = require('./dependency-version-validity')
const treeTruncationRule = require('./tree-truncation')
const reactVersionConsistencyRule = require('./react-version-consistency')
const lockfileRule = require('./lockfile')
const packageManagerConsistencyRule = require('./package-manager-consistency')
const readmeRule = require('./readme')
const gitignoreRule = require('./gitignore')
const reactDependenciesRule = require('./react-dependencies')
const viteDependencyRule = require('./vite-dependency')
const eslintDependencyRule = require('./eslint-dependency')
const typescriptDependencyRule = require('./typescript-dependency')
const environmentExampleRule = require('./environment-example')
const environmentFileSafetyRule = require('./environment-file-safety')
const environmentDocumentationRule = require('./environment-documentation')

// 7 New rules
const missingReadmeRule = require('./missing-readme')
const missingLicenseRule = require('./missing-license')
const missingTestScriptRule = require('./missing-test-script')
const missingCiConfigRule = require('./missing-ci-config')
const gitignoreEssentialsRule = require('./gitignore-essentials')
const unpinnedDependenciesRule = require('./unpinned-dependencies')
const missingNvmrcOrEnginesRule = require('./missing-nvmrc-or-engines')

// Framework rules
const reactDomVersionMatchRule = require('./react-dom-version-match')
const expressStartScriptRule = require('./express-start-script')

// Monorepo rule
const monorepoRule = require('./monorepo')

const allRules = [
	packageJsonRule,
	scriptsRule,
	buildScriptRule,
	devScriptRule,
	dependenciesRule,
	nodeEngineRule,
	dependencyCountRule,
	duplicateDependenciesRule,
	dependencyVersionValidityRule,
	treeTruncationRule,
	reactVersionConsistencyRule,
	lockfileRule,
	packageManagerConsistencyRule,
	readmeRule,
	gitignoreRule,
	reactDependenciesRule,
	viteDependencyRule,
	eslintDependencyRule,
	typescriptDependencyRule,
	environmentExampleRule,
	environmentFileSafetyRule,
	environmentDocumentationRule,
	missingReadmeRule,
	missingLicenseRule,
	missingTestScriptRule,
	missingCiConfigRule,
	gitignoreEssentialsRule,
	unpinnedDependenciesRule,
	missingNvmrcOrEnginesRule,
	reactDomVersionMatchRule,
	expressStartScriptRule,
	monorepoRule,
]

const rulesMap = Object.fromEntries(allRules.map((rule) => [rule.id, rule]))

const validPriorities = new Set(['high', 'medium', 'low'])

const getDiagnosticPriority = (diagnostic) => {
	if (diagnostic.status === 'pass' || diagnostic.status === 'info') {
		return undefined
	}
	const ruleId = diagnostic.ruleId || diagnostic.rule
	if (new Set(['duplicate-dependencies', 'dependency-version-validity', 'environment-file-safety', 'gitignore-essentials']).has(ruleId)) {
		return 'high'
	}
	if (new Set(['scripts', 'build-script', 'dev-script', 'dependencies', 'node-engine', 'lockfile', 'package-manager-consistency', 'react-dependencies', 'vite-dependency', 'eslint-dependency', 'typescript-dependency', 'gitignore', 'missing-test-script', 'missing-ci-config', 'missing-nvmrc-or-engines', 'unpinned-dependencies', 'express-start-script']).has(ruleId)) {
		return 'medium'
	}
	return validPriorities.has(diagnostic.priority) ? diagnostic.priority : 'low'
}

const withPriority = (diagnostic) => {
	const nextDiagnostic = { ...diagnostic }
	if (diagnostic.status === 'pass' || diagnostic.status === 'info') {
		delete nextDiagnostic.priority
		return nextDiagnostic
	}
	const priority = getDiagnosticPriority(diagnostic)
	nextDiagnostic.priority = validPriorities.has(priority) ? priority : 'low'
	return nextDiagnostic
}

const recommendations = {
	scripts: {
		why: 'Developers need clear commands to build, run, and work on the project.',
		recommendation: 'Add the required development and build scripts to package.json.',
	},
	'build-script': {
		why: 'Without a build command, developers may not know how to prepare the project for deployment.',
		recommendation: 'Add a build script to package.json for the detected project tooling.',
	},
	'dev-script': {
		why: 'Without a development command, developers may not know how to start the project locally.',
		recommendation: 'Add a dev script to package.json for the project\'s local development command.',
	},
	dependencies: {
		why: 'The project cannot install or run its required packages without declared dependencies.',
		recommendation: 'Add the project\'s required packages to dependencies or devDependencies in package.json.',
	},
	'node-engine': {
		why: 'Different developers may use different Node.js versions.',
		recommendation: 'Add an engines.node field to package.json.',
	},
	'duplicate-dependencies': {
		why: 'Declaring the same package in both dependency sections can create confusing installation behavior.',
		recommendation: 'Keep each dependency in only one of dependencies or devDependencies.',
	},
	'dependency-version-validity': {
		why: 'Invalid dependency versions can prevent npm from installing the project.',
		recommendation: 'Update invalid dependency version values to valid npm version ranges.',
	},
	'react-version-consistency': {
		why: 'Mismatched React package versions can cause runtime or build problems.',
		recommendation: 'Use matching major versions for react and react-dom.',
	},
	lockfile: {
		why: 'Without one consistent lockfile, dependency versions may vary between installations.',
		recommendation: 'Generate and commit the lockfile for the package manager the project uses.',
	},
	'package-manager-consistency': {
		why: 'Multiple package managers can create inconsistent dependency installations.',
		recommendation: 'Keep only the lockfile for the package manager the project uses.',
	},
	readme: {
		why: 'Developers may not know how to install or run the project.',
		recommendation: 'Add a README.md containing project setup and run instructions.',
	},
	gitignore: {
		why: 'Without a .gitignore, unwanted files such as node_modules or environment files may be committed.',
		recommendation: 'Add a .gitignore appropriate for the detected technology stack.',
	},
	'react-dependencies': {
		why: 'React projects need react-dom for browser rendering.',
		recommendation: 'Add react-dom to the project dependencies.',
	},
	'vite-dependency': {
		why: 'A Vite configuration cannot run reliably when the Vite package is missing.',
		recommendation: 'Add vite to devDependencies in package.json.',
	},
	'eslint-dependency': {
		why: 'An ESLint configuration needs the ESLint package to run checks.',
		recommendation: 'Add eslint to devDependencies in package.json.',
	},
	'typescript-dependency': {
		why: 'A TypeScript configuration needs the TypeScript package to compile the project.',
		recommendation: 'Add typescript to devDependencies in package.json.',
	},
	'environment-example': {
		why: 'Developers need a safe list of environment variable names to configure the project.',
		recommendation: 'Create a .env.example containing variable names but never include real secret values.',
	},
	'environment-file-safety': {
		why: 'A committed .env file may expose secret environment values.',
		recommendation: 'Remove .env from version control, add it to .gitignore, and use .env.example for variable names.',
	},
	'environment-documentation': {
		why: 'Developers may not know which environment variables are required.',
		recommendation: 'Create a .env.example containing variable names but never include real secret values.',
	},
}

// Backward compatible helper wrappers
const checkNodeEngine = (engines = {}) => {
	const res = nodeEngineRule.check(engines)
	return {
		rule: 'node-engine',
		status: res.status === 'warn' ? 'warning' : res.status,
		message: res.message,
		fix: res.fix,
	}
}

const checkDuplicateDependencies = (dependencies = {}, devDependencies = {}) => {
	const res = duplicateDependenciesRule.check(dependencies, devDependencies)
	return {
		rule: 'duplicate-dependencies',
		status: res.status === 'fail' || res.status === 'warn' ? 'warning' : res.status,
		message: res.message,
		fix: res.fix,
	}
}

const checkEnvironmentFileSafety = (filePaths = []) => {
	const res = environmentFileSafetyRule.check(filePaths)
	return {
		rule: 'environment-file-safety',
		status: res.status === 'fail' || res.status === 'warn' ? 'warning' : res.status,
		message: res.message,
		fix: res.fix,
	}
}

const calculateSummary = (diagnostics = []) => {
	return diagnostics.reduce((counts, diagnostic) => {
		const st = (diagnostic.status === 'warn' || diagnostic.status === 'warning')
			? 'warning'
			: (diagnostic.status === 'fail' || diagnostic.status === 'error')
			? 'error'
			: diagnostic.status === 'pass'
			? 'pass'
			: 'info'
		counts[st] = (counts[st] || 0) + 1
		return counts
	}, { total: diagnostics.length, pass: 0, warning: 0, error: 0, info: 0 })
}

const calculateGrade = (score) => {
	if (score >= 90) return 'A'
	if (score >= 80) return 'B'
	if (score >= 70) return 'C'
	if (score >= 60) return 'D'
	return 'F'
}

const GRADE_LABELS = {
	A: 'Healthy',
	B: 'Good',
	C: 'Needs Attention',
	D: 'At Risk',
	F: 'At Risk',
}

const CATEGORIES = ['structure', 'dependencies', 'config', 'testing', 'security', 'docs']

const calculateCategoryScores = (diagnostics = []) => {
	const scores = {}
	for (const cat of CATEGORIES) {
		const catDiagnostics = diagnostics.filter((d) => {
			const ruleCategory = d.category || (rulesMap[d.ruleId || d.rule] ? rulesMap[d.ruleId || d.rule].category : null)
			return (
				ruleCategory === cat &&
				d.status !== 'info' &&
				d.level !== 'info' &&
				d.rule !== 'dependency-count' &&
				d.ruleId !== 'dependency-count'
			)
		})

		if (catDiagnostics.length === 0) {
			scores[cat] = 100
			continue
		}

		let pass = 0
		let warning = 0
		let error = 0

		for (const d of catDiagnostics) {
			if (d.status === 'pass') {
				pass++
			} else if (d.status === 'warn' || d.status === 'warning') {
				warning++
			} else if (d.status === 'fail' || d.status === 'error') {
				error++
			}
		}

		const total = pass + warning + error
		scores[cat] = total === 0 ? 100 : Math.round(((pass * 100) + (warning * 50)) / total)
	}
	return scores
}

const informationalRules = new Set(['dependency-count', 'environment-documentation'])

const calculateHealthScore = (diagnostics = []) => {
	const scoredDiagnostics = diagnostics.filter((diagnostic) => {
		const ruleKey = diagnostic.ruleId || diagnostic.rule
		return (
			diagnostic.status !== 'info' &&
			diagnostic.level !== 'info' &&
			ruleKey !== 'dependency-count' &&
			!(informationalRules.has(ruleKey) && diagnostic.message === 'No environment configuration was detected.')
		)
	})

	const scoredSummary = scoredDiagnostics.reduce((counts, diagnostic) => {
		const st = (diagnostic.status === 'warn' || diagnostic.status === 'warning')
			? 'warning'
			: (diagnostic.status === 'fail' || diagnostic.status === 'error')
			? 'error'
			: diagnostic.status === 'pass'
			? 'pass'
			: 'other'

		if (st in counts) {
			counts[st] = (counts[st] || 0) + 1
		}
		return counts
	}, { total: scoredDiagnostics.length, pass: 0, warning: 0, error: 0 })

	const score = scoredSummary.total === 0
		? 0
		: Math.round(((scoredSummary.pass * 100) + (scoredSummary.warning * 50)) / scoredSummary.total)

	const grade = calculateGrade(score)
	const status = GRADE_LABELS[grade] || 'At Risk'

	return {
		score,
		status,
		label: status,
		grade,
	}
}

const runDiagnostics = ({ packageJson = {}, treeData = {} }) => {
	const framework = detectFramework(packageJson)
	const ctx = { packageJson, treeData, framework }
	const norm = normalizeContext(ctx)
	const { dependencies, devDependencies, filePaths } = norm
	const dependencyNames = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])

	const hasEslintConfig = [...filePaths].some((path) =>
		/(^|\/)(eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|\.eslintrc)$/.test(path),
	)
	const hasTsconfig = filePaths.has('tsconfig.json')
	const stack = [
		{ name: 'React', detected: dependencyNames.has('react') },
		{ name: 'Vite', detected: dependencyNames.has('vite') },
		{ name: 'Express', detected: dependencyNames.has('express') },
		{ name: 'TypeScript', detected: dependencyNames.has('typescript') || hasTsconfig },
		{ name: 'ESLint', detected: dependencyNames.has('eslint') || hasEslintConfig },
	]

	const ruleList = [
		packageJsonRule,
		scriptsRule,
		buildScriptRule,
		devScriptRule,
		dependenciesRule,
		nodeEngineRule,
		dependencyCountRule,
		duplicateDependenciesRule,
		dependencyVersionValidityRule,
	]

	if (treeData && treeData.truncated) {
		ruleList.push(treeTruncationRule)
	}

	const hasWorkspaceYaml = filePaths.has('pnpm-workspace.yaml') || [...filePaths].some((p) => typeof p === 'string' && p.split('/').pop() === 'pnpm-workspace.yaml')
	const hasLerna = filePaths.has('lerna.json') || [...filePaths].some((p) => typeof p === 'string' && p.split('/').pop() === 'lerna.json')
	const hasWorkspaces = Boolean(packageJson && packageJson.workspaces)
	const isMonorepo = Boolean(hasWorkspaceYaml || hasLerna || hasWorkspaces)

	if (isMonorepo) {
		ruleList.push(monorepoRule)
	}

	const reactVersion = dependencies.react || devDependencies.react
	const reactDomVersion = dependencies['react-dom'] || devDependencies['react-dom']
	if (reactVersion && reactDomVersion) {
		ruleList.push(reactVersionConsistencyRule)
	}

	ruleList.push(
		lockfileRule,
		packageManagerConsistencyRule,
		readmeRule,
		gitignoreRule,
	)

	if (dependencyNames.has('react')) {
		ruleList.push(reactDependenciesRule)
	}

	if (dependencyNames.has('vite') || filePaths.has('vite.config.js') || filePaths.has('vite.config.ts')) {
		ruleList.push(viteDependencyRule)
	}

	if (hasEslintConfig || dependencyNames.has('eslint')) {
		ruleList.push(eslintDependencyRule)
	}

	if (hasTsconfig) {
		ruleList.push(typescriptDependencyRule)
	}

	ruleList.push(
		environmentExampleRule,
		environmentFileSafetyRule,
		environmentDocumentationRule,
		missingReadmeRule,
		missingLicenseRule,
		missingTestScriptRule,
		missingCiConfigRule,
		gitignoreEssentialsRule,
		unpinnedDependenciesRule,
		missingNvmrcOrEnginesRule,
	)

	if (framework === 'react' || dependencyNames.has('react')) {
		ruleList.push(reactDomVersionMatchRule)
	}

	if (framework === 'express' || dependencyNames.has('express')) {
		ruleList.push(expressStartScriptRule)
	}

	const rawDiagnostics = ruleList.map((rule) => {
		const result = rule.check(ctx)
		const status = result.status === 'warn'
			? 'warning'
			: result.status === 'fail'
			? 'error'
			: result.status

		const diagnostic = {
			rule: rule.id,
			ruleId: rule.id,
			title: rule.title,
			category: rule.category,
			severity: rule.severity,
			status,
			message: result.message,
			fix: result.fix || null,
		}

		if (result.status === 'info') {
			diagnostic.level = 'info'
		}

		return diagnostic
	})

	const diagnosticsWithRecommendations = rawDiagnostics.map((diagnostic) => {
		const rec = recommendations[diagnostic.rule]
		return rec && diagnostic.status !== 'pass' && diagnostic.status !== 'info'
			? { ...diagnostic, ...rec }
			: diagnostic
	})

	const finalDiagnostics = diagnosticsWithRecommendations.map(withPriority)

	const summary = calculateSummary(finalDiagnostics)
	const health = calculateHealthScore(finalDiagnostics)
	const categoryScores = calculateCategoryScores(finalDiagnostics)
	const grade = calculateGrade(health.score)
	health.grade = grade
	health.categoryScores = categoryScores

	return {
		stack,
		diagnostics: finalDiagnostics,
		summary,
		health,
		framework,
		categoryScores,
		grade,
		monorepo: isMonorepo,
	}
}

const rules = {
	'node-engine': checkNodeEngine,
	'duplicate-dependencies': checkDuplicateDependencies,
	'environment-file-safety': checkEnvironmentFileSafety,
}

module.exports = {
	getMajorVersion,
	isValidDependencyVersion,
	isIgnoredPath,
	isCandidateEnvFile,
	formatList,
	IGNORED_PATH_SEGMENTS,
	hasEnvironmentUsage,
	validPriorities,
	getDiagnosticPriority,
	withPriority,
	recommendations,
	checkNodeEngine,
	checkDuplicateDependencies,
	checkEnvironmentFileSafety,
	rules,
	allRules,
	rulesMap,
	calculateSummary,
	calculateGrade,
	GRADE_LABELS,
	calculateCategoryScores,
	calculateHealthScore,
	calculateHealth: calculateHealthScore,
	detectFramework,
	runDiagnostics,
}
