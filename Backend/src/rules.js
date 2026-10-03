const getMajorVersion = (version) => {
	const match = typeof version === 'string' ? version.trim().match(/^[~^<>=\s]*v?(\d+)/) : null
	return match ? Number(match[1]) : null
}

const isValidDependencyVersion = (version) => {
	if (typeof version !== 'string' || !version.trim()) {
		return false
	}

	const versionPart = '(?:\\d+|[xX*])(?:\\.(?:\\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?'
	const versionPattern = new RegExp(`^(?:[~^<>=]*\\s*)?${versionPart}(?:\\s*(?:\\|\\||-)\\s*(?:[~^<>=]*\\s*)?${versionPart})*$`)
	return versionPattern.test(version.trim())
}

const validPriorities = new Set(['high', 'medium', 'low'])

const getDiagnosticPriority = (diagnostic) => {
	if (diagnostic.status === 'pass' || diagnostic.status === 'info') {
		return undefined
	}
	if (new Set(['duplicate-dependencies', 'dependency-version-validity', 'environment-file-safety']).has(diagnostic.rule)) {
		return 'high'
	}
	if (new Set(['scripts', 'build-script', 'dev-script', 'dependencies', 'node-engine', 'lockfile', 'package-manager-consistency', 'react-dependencies', 'vite-dependency', 'eslint-dependency', 'typescript-dependency', 'gitignore']).has(diagnostic.rule)) {
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

const checkNodeEngine = (engines = {}) => {
	const eng = engines && typeof engines === 'object' && 'engines' in engines ? engines.engines : engines
	const normalizedEngines = eng && typeof eng === 'object' ? eng : {}
	const hasNode = Object.prototype.hasOwnProperty.call(normalizedEngines, 'node')
	return {
		rule: 'node-engine',
		status: hasNode ? 'pass' : 'warning',
		message: hasNode
			? `Node.js requirement is configured as ${normalizedEngines.node}.`
			: 'The project does not specify a Node.js version requirement.',
	}
}

const checkDuplicateDependencies = (dependencies = {}, devDependencies = {}) => {
	if (dependencies && !devDependencies && (dependencies.dependencies || dependencies.devDependencies)) {
		devDependencies = dependencies.devDependencies || {}
		dependencies = dependencies.dependencies || {}
	}
	const deps = dependencies && typeof dependencies === 'object' ? dependencies : {}
	const devDeps = devDependencies && typeof devDependencies === 'object' ? devDependencies : {}
	const duplicateDependencies = Object.keys(deps).filter((name) =>
		Object.prototype.hasOwnProperty.call(devDeps, name)
	)
	return {
		rule: 'duplicate-dependencies',
		status: duplicateDependencies.length ? 'warning' : 'pass',
		message: duplicateDependencies.length
			? `These dependencies are declared in both sections: ${duplicateDependencies.join(', ')}.`
			: 'No dependencies are duplicated between dependencies and devDependencies.',
	}
}

const checkEnvironmentFileSafety = (filePaths = []) => {
	const paths = filePaths instanceof Set
		? filePaths
		: Array.isArray(filePaths)
		? new Set(filePaths)
		: filePaths && typeof filePaths === 'object' && Array.isArray(filePaths.filePaths)
		? new Set(filePaths.filePaths)
		: new Set()

	const hasEnvFile = [...paths].some((path) => typeof path === 'string' && path.split('/').pop() === '.env')
	return {
		rule: 'environment-file-safety',
		status: hasEnvFile ? 'warning' : 'pass',
		message: hasEnvFile
			? 'A .env file is committed; environment files may contain secrets.'
			: 'No committed .env file was found.',
	}
}

const rules = {
	'node-engine': checkNodeEngine,
	'duplicate-dependencies': checkDuplicateDependencies,
	'environment-file-safety': checkEnvironmentFileSafety,
}

const calculateSummary = (diagnostics = []) => {
	return diagnostics.reduce((counts, diagnostic) => {
		counts[diagnostic.status] = (counts[diagnostic.status] || 0) + 1
		return counts
	}, { total: diagnostics.length, pass: 0, warning: 0, error: 0, info: 0 })
}

const informationalRules = new Set(['dependency-count', 'environment-documentation'])

const calculateHealthScore = (diagnostics = []) => {
	const scoredDiagnostics = diagnostics.filter((diagnostic) =>
		diagnostic.status !== 'info' &&
		diagnostic.rule !== 'dependency-count' &&
		!(informationalRules.has(diagnostic.rule) && diagnostic.message === 'No environment configuration was detected.')
	)
	const scoredSummary = scoredDiagnostics.reduce((counts, diagnostic) => {
		counts[diagnostic.status] = (counts[diagnostic.status] || 0) + 1
		return counts
	}, { total: scoredDiagnostics.length, pass: 0, warning: 0, error: 0 })
	const score = scoredSummary.total === 0
		? 0
		: Math.round(((scoredSummary.pass * 100) + (scoredSummary.warning * 50)) / scoredSummary.total)
	const status = score >= 90 ? 'Healthy' : score >= 70 ? 'Needs Attention' : 'Critical'
	return {
		score,
		status,
	}
}

const runDiagnostics = ({ packageJson = {}, treeData = {} }) => {
	const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}
	const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}
	const devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {}
	const engines = packageJson.engines && typeof packageJson.engines === 'object' ? packageJson.engines : {}
	const dependencyNames = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])
	const allDependencyEntries = [...Object.entries(dependencies), ...Object.entries(devDependencies)]

	const filePaths = new Set(
		Array.isArray(treeData.tree)
			? treeData.tree.filter((item) => item.type === 'blob').map((item) => item.path)
			: [],
	)
	const hasEslintConfig = [...filePaths].some((path) =>
		/(^|\/)(eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|\.eslintrc)$/.test(path),
	)
	const hasEnvExample = [...filePaths].some((path) => path.split('/').pop() === '.env.example')
	const hasEnvFile = [...filePaths].some((path) => path.split('/').pop() === '.env')
	const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].filter((fileName) => filePaths.has(fileName))
	const readmeFiles = ['README.md', 'README', 'README.txt'].filter((fileName) => filePaths.has(fileName))
	const hasGitignore = filePaths.has('.gitignore')
	const packageManagers = lockfiles.map((fileName) => ({
		'package-lock.json': 'npm',
		'yarn.lock': 'Yarn',
		'pnpm-lock.yaml': 'pnpm',
	}[fileName]))
	const hasTsconfig = filePaths.has('tsconfig.json')
	const stack = [
		{ name: 'React', detected: dependencyNames.has('react') },
		{ name: 'Vite', detected: dependencyNames.has('vite') },
		{ name: 'Express', detected: dependencyNames.has('express') },
		{ name: 'TypeScript', detected: dependencyNames.has('typescript') || hasTsconfig },
		{ name: 'ESLint', detected: dependencyNames.has('eslint') || hasEslintConfig },
	]

	const diagnostics = [
		{
			rule: 'package-json',
			status: 'pass',
			message: 'package.json exists.',
		},
		{
			rule: 'scripts',
			status: Object.keys(scripts).length ? 'pass' : 'warning',
			message: Object.keys(scripts).length ? 'Scripts section is configured.' : 'Scripts section is missing.',
		},
		{
			rule: 'build-script',
			status: scripts.build ? 'pass' : 'warning',
			message: scripts.build ? 'Build script is configured.' : 'Build script is missing.',
		},
		{
			rule: 'dev-script',
			status: scripts.dev ? 'pass' : 'warning',
			message: scripts.dev ? 'Dev script is configured.' : 'Dev script is missing.',
		},
		{
			rule: 'dependencies',
			status: Object.keys(dependencies).length || Object.keys(devDependencies).length ? 'pass' : 'warning',
			message: Object.keys(dependencies).length || Object.keys(devDependencies).length
				? 'Dependencies are configured.'
				: 'No dependencies or devDependencies are configured.',
		},
		checkNodeEngine(engines),
		{
			rule: 'dependency-count',
			status: 'pass',
			message: `${Object.keys(dependencies).length} production dependencies and ${Object.keys(devDependencies).length} development dependencies are configured.`,
		},
		checkDuplicateDependencies(dependencies, devDependencies),
		{
			rule: 'dependency-version-validity',
			status: allDependencyEntries.every(([, version]) => isValidDependencyVersion(version)) ? 'pass' : 'warning',
			message: allDependencyEntries.every(([, version]) => isValidDependencyVersion(version))
				? 'Dependency version values use valid npm version ranges.'
				: 'One or more dependency version values are empty or use an invalid npm version range.',
		},
	].map(withPriority)

	if (treeData && treeData.truncated) {
		diagnostics.push(withPriority({
			rule: 'tree-truncation',
			status: 'info',
			level: 'info',
			message: 'Repository tree truncated; results may be incomplete.',
		}))
	}

	const reactVersion = dependencies.react || devDependencies.react
	const reactDomVersion = dependencies['react-dom'] || devDependencies['react-dom']
	if (reactVersion && reactDomVersion) {
		const reactMajor = getMajorVersion(reactVersion)
		const reactDomMajor = getMajorVersion(reactDomVersion)
		const versionsMatch = reactMajor !== null && reactMajor === reactDomMajor
		diagnostics.push(withPriority({
			rule: 'react-version-consistency',
			status: versionsMatch ? 'pass' : 'warning',
			message: versionsMatch
				? 'React and React DOM major versions match.'
				: 'React and React DOM major versions do not match or could not be compared.',
		}))
	}

	if (lockfiles.length === 1) {
		diagnostics.push(withPriority({
			rule: 'lockfile',
			status: 'pass',
			message: 'A package manager lockfile is present.',
		}))
	} else {
		diagnostics.push(withPriority({
			rule: 'lockfile',
			status: 'warning',
			message: lockfiles.length ? 'Multiple package manager lockfiles were found.' : 'No package manager lockfile was found.',
		}))
	}

	diagnostics.push(withPriority({
		rule: 'package-manager-consistency',
		status: lockfiles.length === 1 ? 'pass' : 'warning',
		message: lockfiles.length === 1
			? `${packageManagers[0]} package manager lockfile is present.`
			: lockfiles.length > 1
				? `Multiple package manager lockfiles were found: ${lockfiles.join(', ')}.`
				: 'No supported package manager lockfile was found.',
	}))
	diagnostics.push(withPriority({
		rule: 'readme',
		status: readmeFiles.length ? 'pass' : 'warning',
		message: readmeFiles.length
			? `Repository documentation is present: ${readmeFiles.join(', ')}.`
			: 'No README file was found.',
	}))
	diagnostics.push(withPriority({
		rule: 'gitignore',
		status: hasGitignore ? 'pass' : 'warning',
		message: hasGitignore
			? '.gitignore is present.'
			: '.gitignore is missing.',
	}))

	if (dependencyNames.has('react')) {
		diagnostics.push(withPriority({
			rule: 'react-dependencies',
			status: dependencyNames.has('react-dom') ? 'pass' : 'warning',
			message: dependencyNames.has('react-dom')
				? 'React and React DOM dependencies are configured.'
				: 'React is installed but react-dom is missing.',
		}))
	}

	if (dependencyNames.has('vite') || filePaths.has('vite.config.js') || filePaths.has('vite.config.ts')) {
		diagnostics.push(withPriority({
			rule: 'vite-dependency',
			status: dependencyNames.has('vite') ? 'pass' : 'warning',
			message: dependencyNames.has('vite')
				? 'Vite is configured as a project dependency.'
				: 'Vite configuration was detected but the Vite package is missing.',
		}))
	}

	if (hasEslintConfig || dependencyNames.has('eslint')) {
		diagnostics.push(withPriority({
			rule: 'eslint-dependency',
			status: dependencyNames.has('eslint') ? 'pass' : 'warning',
			message: dependencyNames.has('eslint')
				? 'ESLint is configured.'
				: 'ESLint configuration exists but the eslint package is missing.',
		}))
	}

	if (hasTsconfig) {
		diagnostics.push(withPriority({
			rule: 'typescript-dependency',
			status: dependencyNames.has('typescript') ? 'pass' : 'warning',
			message: dependencyNames.has('typescript')
				? 'TypeScript configuration is consistent.'
				: 'tsconfig.json exists but the TypeScript package is missing.',
		}))
	}

	diagnostics.push(withPriority({
		rule: 'environment-example',
		status: hasEnvExample ? 'pass' : 'warning',
		message: hasEnvExample
			? '.env.example is present.'
			: '.env.example is missing; add one if the project needs environment variables.',
	}))
	diagnostics.push(withPriority(checkEnvironmentFileSafety(filePaths)))
	diagnostics.push(withPriority({
		rule: 'environment-documentation',
		status: hasEnvExample ? 'pass' : hasEnvFile ? 'warning' : 'pass',
		message: hasEnvExample
			? '.env.example documents the environment configuration.'
			: hasEnvFile
				? '.env is present without .env.example documentation.'
				: 'No environment configuration was detected.',
	}))

	const diagnosticsWithRecommendations = diagnostics.map((diagnostic) => {
		const recommendation = recommendations[diagnostic.rule]
		return recommendation && diagnostic.status !== 'pass'
			? { ...diagnostic, ...recommendation }
			: diagnostic
	})
	const finalDiagnostics = diagnosticsWithRecommendations.map((diagnostic) => {
		const nextDiagnostic = { ...diagnostic }
		if (nextDiagnostic.status === 'pass' || nextDiagnostic.status === 'info') {
			delete nextDiagnostic.priority
			return nextDiagnostic
		}
		const priority = getDiagnosticPriority(nextDiagnostic)
		nextDiagnostic.priority = validPriorities.has(priority) ? priority : 'low'
		return nextDiagnostic
	})

	const summary = calculateSummary(diagnosticsWithRecommendations)
	const health = calculateHealthScore(diagnosticsWithRecommendations)

	return {
		stack,
		diagnostics: finalDiagnostics,
		summary,
		health,
	}
}

module.exports = {
	getMajorVersion,
	isValidDependencyVersion,
	validPriorities,
	getDiagnosticPriority,
	withPriority,
	recommendations,
	checkNodeEngine,
	checkDuplicateDependencies,
	checkEnvironmentFileSafety,
	rules,
	calculateSummary,
	calculateHealthScore,
	calculateHealth: calculateHealthScore,
	runDiagnostics,
}
