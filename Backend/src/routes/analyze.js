const express = require('express')
const { ghFetch } = require('../services/github')
const { parseRepository } = require('../../../shared/repository')

const router = express.Router()

const handleAnalyze = async (req, res, next) => {
	const { repositoryUrl } = req.body || {}

	let parsed
	try {
		parsed = parseRepository(repositoryUrl)
	} catch (err) {
		return res.status(400).json({
			success: false,
			message: err.message,
		})
	}

	const { owner, repo } = parsed

	try {
		const githubResponse = await ghFetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
		)

		if (githubResponse.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'GitHub token is invalid or expired',
			})
		}

		if (githubResponse.status === 404) {
			return res.status(404).json({
				success: false,
				message: 'Repository not found or private',
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
		if (res?.writableEnded || error?.name === 'AbortError') {
			return
		}
		if (error && error.status) {
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
