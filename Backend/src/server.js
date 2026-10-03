const cors = require('cors')
const dotenv = require('dotenv')
const express = require('express')
const { runDiagnostics } = require('./rules')

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const configuredOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
	: []
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultAllowedOrigins

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

const identifierPattern = /^[\w.-]{1,100}$/
const isValidIdentifier = (value) => typeof value === 'string' && identifierPattern.test(value)

const allowedFileNames = new Set([
	'package.json',
	'tsconfig.json',
	'README.md',
	'.gitignore',
	'.env.example',
	'eslint.config.js',
	'vite.config.js',
])

const getGithubHeaders = () => {
	const headers = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'SetupDoctor',
	}
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
	}
	return headers
}

const ghFetch = async (url) => {
	const response = await fetch(url, {
		headers: getGithubHeaders(),
		signal: AbortSignal.timeout(8000),
	})

	if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
		const error = new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN.')
		error.status = 429
		throw error
	}

	return response
}

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

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
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
	} catch (error) {
		if (error && error.status === 429) {
			return res.status(429).json({
				success: false,
				message: error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
			})
		}
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

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	if (typeof path !== 'string' || path.includes('..')) {
		return res.status(403).json({
			success: false,
			message: 'Access to the requested file is forbidden',
		})
	}

	const fileName = path.split('/').pop()
	if (!allowedFileNames.has(fileName)) {
		return res.status(403).json({
			success: false,
			message: 'Access to the requested file is forbidden',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
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
	} catch (error) {
		if (error && error.status === 429) {
			return res.status(429).json({
				success: false,
				message: error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
			})
		}
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.post('/api/repository/diagnose', async (req, res) => {
	const { owner, repo, branch } = req.body || {}

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`,
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

		const treeResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
		)

		if (!treeResponse.ok) {
			return res.status(502).json({
				success: false,
				message: 'GitHub API request failed',
			})
		}

		const treeData = await treeResponse.json()
		const { stack, diagnostics, summary, health } = runDiagnostics({ packageJson, treeData })

		return res.json({
			success: true,
			project: {
				name: packageJson.name || null,
				dependencies,
				devDependencies,
				scripts,
			},
			stack,
			diagnostics,
			summary,
			health,
		})
	} catch (error) {
		if (error && error.status === 429) {
			return res.status(429).json({
				success: false,
				message: error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
			})
		}
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

app.post('/api/repository/build-check', async (req, res) => {
	const { owner, repo, branch } = req.body || {}

	if (!owner || !repo || !branch) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch are required',
		})
	}

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo) || !isValidIdentifier(branch)) {
		return res.status(400).json({
			success: false,
			message: 'owner, repo, and branch must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`,
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

		if (packageJson.scripts && packageJson.scripts.build) {
			return res.json({
				success: true,
				build: {
					status: 'ready',
					command: 'npm run build',
				},
			})
		}

		return res.json({
			success: true,
			build: {
				status: 'unavailable',
				message: 'No build script is configured in package.json.',
			},
		})
	} catch (error) {
		if (error && error.status === 429) {
			return res.status(429).json({
				success: false,
				message: error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
			})
		}
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

	if (!isValidIdentifier(owner) || !isValidIdentifier(repo)) {
		return res.status(400).json({
			success: false,
			message: 'owner and repo must be valid identifiers',
		})
	}

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
		)

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
	} catch (error) {
		if (error && error.status === 429) {
			return res.status(429).json({
				success: false,
				message: error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
			})
		}
		return res.status(502).json({
			success: false,
			message: 'Unable to connect to the GitHub API',
		})
	}
})

if (require.main === module) {
	app.listen(port, () => {
		console.log(`SetupDoctor backend listening on port ${port}`)
	})
}

module.exports = app
module.exports.app = app
