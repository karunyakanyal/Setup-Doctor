const express = require('express')
const { runDiagnostics } = require('../rules')
const { ghFetch } = require('../services/github')

const router = express.Router()

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

const handleTree = async (req, res, next) => {
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
			return next(error)
		}
		const err = new Error('Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

const handleFile = async (req, res, next) => {
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
			return next(error)
		}
		const err = new Error('Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

const handleDiagnose = async (req, res, next) => {
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
			return next(error)
		}
		const err = new Error('Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

const handleBuildCheck = async (req, res, next) => {
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
			return next(error)
		}
		const err = new Error('Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

router.get('/tree', handleTree)
router.get('/repository/tree', handleTree)

router.get('/file', handleFile)
router.get('/repository/file', handleFile)

router.post('/diagnose', handleDiagnose)
router.post('/repository/diagnose', handleDiagnose)

router.post('/build-check', handleBuildCheck)
router.post('/repository/build-check', handleBuildCheck)

module.exports = router
