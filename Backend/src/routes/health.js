const express = require('express')
const packageJson = require('../../package.json')
const { getCachedRateLimit } = require('../services/github')
const { getGraphCacheSize, MAX_GRAPH_CACHE_ENTRIES } = require('../services/graph')
const { getActiveScans } = require('./repository')

const router = express.Router()

const handleHealth = (req, res) => {
	const githubRateLimit = getCachedRateLimit()

	res.json({
		status: 'ok',
		message: 'SetupDoctor backend is running',
		uptimeSeconds: Math.floor(process.uptime()),
		version: packageJson.version,
		githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()),
		githubRateLimit: githubRateLimit
			? {
					remaining: githubRateLimit.remaining,
					limit: githubRateLimit.limit,
					resetsAt: githubRateLimit.resetsAt,
			  }
			: null,
		graphCache: {
			entries: getGraphCacheSize(),
			max: MAX_GRAPH_CACHE_ENTRIES,
		},
		activeDeepScans: getActiveScans(),
	})
}

router.get('/', handleHealth)
router.get('/health', handleHealth)

module.exports = router
module.exports.handleHealth = handleHealth
