const express = require('express')
const { ghFetch } = require('../services/github')

const router = express.Router()

const identifierPattern = /^[\w.-]{1,100}$/
const isValidIdentifier = (value) => typeof value === 'string' && identifierPattern.test(value)

const handleAnalyze = async (req, res, next) => {
	const { repositoryUrl } = req.body || {}

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
			return next(error)
		}
		const err = new Error('Unable to connect to the GitHub API')
		err.status = 502
		return next(err)
	}
}

router.post('/', handleAnalyze)
router.post('/analyze', handleAnalyze)

module.exports = router
