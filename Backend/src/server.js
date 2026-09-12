const cors = require('cors')
const dotenv = require('dotenv')
const express = require('express')

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

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

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
	res.json({
		status: 'ok',
		message: 'SetupDoctor backend is running',
	})
})

app.get('/api/repository/tree', async (req, res) => {
	const { owner, repo, branch } = req.query

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	try {
		const githubResponse = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
			{
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'SetupDoctor',
				},
			},
		)

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'GitHub repository or branch not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubTree = await githubResponse.json()

		return res.json({
			success: true,
			tree: githubTree.tree.map((item) => ({
				path: item.path,
				type: item.type,
			})),
		})
	} catch {
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.get('/api/repository/file', async (req, res) => {
	const { owner, repo, branch, path } = req.query

	if (!owner || !repo || !branch || !path) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, branch, and path are required',
		})
	}
	const fileName = path.split('/').pop()
	if (fileName === '.env' || (fileName.startsWith('.env.') && fileName !== '.env.example')) {
		return res.status(403).json({
			success: false,
			message: 'Environment file contents cannot be retrieved',
		})
	}

	try {
		const githubResponse = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
			{
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'SetupDoctor',
				},
			},
		)

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'GitHub file not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubFile = await githubResponse.json()
		const content = Buffer.from(githubFile.content, 'base64').toString('utf8')

		return res.json({
			success: true,
			path,
			content,
		})
	} catch {
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.post('/api/repository/diagnose', async (req, res) => {
	const { owner, repo, branch } = req.body

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	try {
		const githubResponse = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`,
			{
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'SetupDoctor',
				},
			},
		)

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'package.json not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const githubFile = await githubResponse.json()
		const packageContent = Buffer.from(githubFile.content, 'base64').toString('utf8')
		let packageJson

		try {
			packageJson = JSON.parse(packageContent)
		} catch {
			return res.status(422).json({
				success: false,
				message: 'package.json contains invalid JSON',
			})
		}

		const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}
		const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}
		const devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {}
		const engines = packageJson.engines && typeof packageJson.engines === 'object' ? packageJson.engines : {}
		const dependencyNames = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])
		const duplicateDependencies = Object.keys(dependencies).filter((name) => Object.prototype.hasOwnProperty.call(devDependencies, name))
		const allDependencyEntries = [...Object.entries(dependencies), ...Object.entries(devDependencies)]
		const treeResponse = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
			{
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'SetupDoctor',
				},
			},
		)

		if (!treeResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const treeData = await treeResponse.json()
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
			{
				rule: 'node-engine',
				status: Object.prototype.hasOwnProperty.call(engines, 'node') ? 'pass' : 'warning',
				message: Object.prototype.hasOwnProperty.call(engines, 'node')
					? `Node.js requirement is configured as ${engines.node}.`
					: 'The project does not specify a Node.js version requirement.',
			},
			{
				rule: 'dependency-count',
				status: 'pass',
				message: `${Object.keys(dependencies).length} production dependencies and ${Object.keys(devDependencies).length} development dependencies are configured.`,
			},
			{
				rule: 'duplicate-dependencies',
				status: duplicateDependencies.length ? 'warning' : 'pass',
				message: duplicateDependencies.length
					? `These dependencies are declared in both sections: ${duplicateDependencies.join(', ')}.`
					: 'No dependencies are duplicated between dependencies and devDependencies.',
			},
			{
				rule: 'dependency-version-validity',
				status: allDependencyEntries.every(([, version]) => isValidDependencyVersion(version)) ? 'pass' : 'warning',
				message: allDependencyEntries.every(([, version]) => isValidDependencyVersion(version))
					? 'Dependency version values use valid npm version ranges.'
					: 'One or more dependency version values are empty or use an invalid npm version range.',
			},
		]

		const reactVersion = dependencies.react || devDependencies.react
		const reactDomVersion = dependencies['react-dom'] || devDependencies['react-dom']
		if (reactVersion && reactDomVersion) {
			const reactMajor = getMajorVersion(reactVersion)
			const reactDomMajor = getMajorVersion(reactDomVersion)
			const versionsMatch = reactMajor !== null && reactMajor === reactDomMajor
			diagnostics.push({
				rule: 'react-version-consistency',
				status: versionsMatch ? 'pass' : 'warning',
				message: versionsMatch
					? 'React and React DOM major versions match.'
					: 'React and React DOM major versions do not match or could not be compared.',
			})
		}

		if (lockfiles.length === 1) {
			diagnostics.push({
				rule: 'lockfile',
				status: 'pass',
				message: 'A package manager lockfile is present.',
			})
		} else {
			diagnostics.push({
				rule: 'lockfile',
				status: 'warning',
				message: lockfiles.length ? 'Multiple package manager lockfiles were found.' : 'No package manager lockfile was found.',
			})
		}

		diagnostics.push({
			rule: 'package-manager-consistency',
			status: lockfiles.length === 1 ? 'pass' : 'warning',
			message: lockfiles.length === 1
				? `${packageManagers[0]} package manager lockfile is present.`
				: lockfiles.length > 1
					? `Multiple package manager lockfiles were found: ${lockfiles.join(', ')}.`
					: 'No supported package manager lockfile was found.',
		})
		diagnostics.push({
			rule: 'readme',
			status: readmeFiles.length ? 'pass' : 'warning',
			message: readmeFiles.length
				? `Repository documentation is present: ${readmeFiles.join(', ')}.`
				: 'No README file was found.',
		})
		diagnostics.push({
			rule: 'gitignore',
			status: hasGitignore ? 'pass' : 'warning',
			message: hasGitignore
				? '.gitignore is present.'
				: '.gitignore is missing.',
		})

		if (dependencyNames.has('react')) {
			diagnostics.push({
				rule: 'react-dependencies',
				status: dependencyNames.has('react-dom') ? 'pass' : 'warning',
				message: dependencyNames.has('react-dom')
					? 'React and React DOM dependencies are configured.'
					: 'React is installed but react-dom is missing.',
			})
		}

		if (dependencyNames.has('vite') || filePaths.has('vite.config.js') || filePaths.has('vite.config.ts')) {
			diagnostics.push({
				rule: 'vite-dependency',
				status: dependencyNames.has('vite') ? 'pass' : 'warning',
				message: dependencyNames.has('vite')
					? 'Vite is configured as a project dependency.'
					: 'Vite configuration was detected but the Vite package is missing.',
			})
		}

		if (hasEslintConfig || dependencyNames.has('eslint')) {
			diagnostics.push({
				rule: 'eslint-dependency',
				status: dependencyNames.has('eslint') ? 'pass' : 'warning',
				message: dependencyNames.has('eslint')
					? 'ESLint is configured.'
					: 'ESLint configuration exists but the eslint package is missing.',
			})
		}

		if (hasTsconfig) {
			diagnostics.push({
				rule: 'typescript-dependency',
				status: dependencyNames.has('typescript') ? 'pass' : 'warning',
				message: dependencyNames.has('typescript')
					? 'TypeScript configuration is consistent.'
					: 'tsconfig.json exists but the TypeScript package is missing.',
			})
		}

		diagnostics.push({
			rule: 'environment-example',
			status: hasEnvExample ? 'pass' : 'warning',
			message: hasEnvExample
				? '.env.example is present.'
				: '.env.example is missing; add one if the project needs environment variables.',
		})
		diagnostics.push({
			rule: 'environment-file-safety',
			status: hasEnvFile ? 'warning' : 'pass',
			message: hasEnvFile
				? 'A .env file is committed; environment files may contain secrets.'
				: 'No committed .env file was found.',
		})
		diagnostics.push({
			rule: 'environment-documentation',
			status: hasEnvExample ? 'pass' : hasEnvFile ? 'warning' : 'pass',
			message: hasEnvExample
				? '.env.example documents the environment configuration.'
				: hasEnvFile
					? '.env is present without .env.example documentation.'
					: 'No environment configuration was detected.',
		})

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
		const diagnosticsWithRecommendations = diagnostics.map((diagnostic) => {
			const recommendation = recommendations[diagnostic.rule]
			return recommendation && diagnostic.status !== 'pass'
				? { ...diagnostic, ...recommendation }
				: diagnostic
		})

		const summary = diagnosticsWithRecommendations.reduce((counts, diagnostic) => {
			counts[diagnostic.status] += 1
			return counts
		}, { total: diagnostics.length, pass: 0, warning: 0, error: 0 })
		const informationalRules = new Set(['dependency-count', 'environment-documentation'])
		const scoredDiagnostics = diagnosticsWithRecommendations.filter((diagnostic) => diagnostic.rule !== 'dependency-count' && !(informationalRules.has(diagnostic.rule) && diagnostic.message === 'No environment configuration was detected.'))
		const scoredSummary = scoredDiagnostics.reduce((counts, diagnostic) => {
			counts[diagnostic.status] += 1
			return counts
		}, { total: scoredDiagnostics.length, pass: 0, warning: 0, error: 0 })
		const score = scoredSummary.total === 0
			? 0
			: Math.round(((scoredSummary.pass * 100) + (scoredSummary.warning * 50)) / scoredSummary.total)
		const health = {
			score,
			status: score >= 90 ? 'Healthy' : score >= 70 ? 'Needs Attention' : 'Critical',
		}

		return res.json({
			success: true,
			project: {
				name: packageJson.name || null,
				dependencies,
				devDependencies,
				scripts,
			},
			stack,
			diagnostics: diagnosticsWithRecommendations,
			summary,
			health,
		})
	} catch {
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.post('/api/analyze', async (req, res) => {
	const { repositoryUrl } = req.body

	if (typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
		return res.status(400).json({
			success: false,
			message: 'repositoryUrl is required',
		})
	}

	let githubUrl
	try {
		githubUrl = new URL(repositoryUrl.trim())
	} catch {
		return res.status(400).json({
			success: false,
			message: 'repositoryUrl must be a valid GitHub repository URL',
		})
	}

	const isGithubHost = ['github.com', 'www.github.com'].includes(githubUrl.hostname.toLowerCase())
	const pathParts = githubUrl.pathname.split('/').filter(Boolean)

	if (githubUrl.protocol !== 'https:' || !isGithubHost || pathParts.length !== 2) {
		return res.status(400).json({
			success: false,
			message: 'repositoryUrl must be a valid GitHub repository URL',
		})
	}

	const [owner, repo] = pathParts

	try {
		const githubResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'SetupDoctor',
			},
		})

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'GitHub repository not found',
			})
		}

		if (!githubResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const repository = await githubResponse.json()

		return res.json({
			success: true,
			name: repository.name,
			fullName: repository.full_name,
			owner: repository.owner.login,
			defaultBranch: repository.default_branch,
			language: repository.language,
			description: repository.description,
			stars: repository.stargazers_count,
		})
	} catch {
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.listen(port, () => {
	console.log(`SetupDoctor backend listening on port ${port}`)
})
