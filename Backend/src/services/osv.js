const osvCache = new Map() // key -> { timestamp, data }
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Extract production dependencies and their versions from a lockfile.
 */
function extractProductionDepsFromLockfile(lockfileText, packageJsonContent = {}) {
	if (!lockfileText) return []
	const prodDepNames = new Set(Object.keys(packageJsonContent?.dependencies || {}))
	const results = []

	try {
		const lock = JSON.parse(lockfileText)
		// npm lockfile v2 / v3
		if (lock.packages) {
			for (const [pkgPath, pkgData] of Object.entries(lock.packages)) {
				if (!pkgPath) continue // root package
				// skip dev dependencies
				if (pkgData.dev === true) continue
				const name = pkgData.name || pkgPath.replace(/^node_modules\//, '')
				if (prodDepNames.size === 0 || prodDepNames.has(name)) {
					const version = pkgData.version
					if (name && version && !results.some((r) => r.name === name)) {
						results.push({ name, version, ecosystem: 'npm' })
					}
				}
			}
		} else if (lock.dependencies) {
			// npm lockfile v1
			for (const [name, pkgData] of Object.entries(lock.dependencies)) {
				if (pkgData.dev === true) continue
				if (prodDepNames.size === 0 || prodDepNames.has(name)) {
					const version = pkgData.version
					if (name && version && !results.some((r) => r.name === name)) {
						results.push({ name, version, ecosystem: 'npm' })
					}
				}
			}
		}
	} catch {
		// Not JSON (e.g. yarn.lock / pnpm-lock)
		// For yarn lockfile or fallback, match production dep names
		for (const name of prodDepNames) {
			const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			const yarnRegex = new RegExp(`"?${escaped}@[^":]+"?:\\s*\\r?\\n\\s*version\\s*"([^"]+)"`)
			const match = yarnRegex.exec(lockfileText)
			if (match) {
				results.push({ name, version: match[1], ecosystem: 'npm' })
			}
		}
	}

	return results
}

/**
 * Map advisory severity string to our standard severity.
 */
function mapOsvSeverity(vuln) {
	const dbSev = vuln?.database_specific?.severity?.toUpperCase() || ''
	if (dbSev === 'CRITICAL') return 'critical'
	if (dbSev === 'HIGH') return 'critical'
	if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') return 'important'
	if (dbSev === 'LOW') return 'nice-to-have'

	if (Array.isArray(vuln?.severity)) {
		for (const s of vuln.severity) {
			if (typeof s?.score === 'string' && s.score.startsWith('CVSS:')) {
				const scoreNum = parseFloat(s.score.split('/')[0])
				if (scoreNum >= 9.0) return 'critical'
				if (scoreNum >= 7.0) return 'important'
				return 'nice-to-have'
			}
		}
	}
	return 'important'
}

/**
 * Query OSV batch API with caching and silent fallback.
 */
async function queryOsvVulnerabilities(deps = [], options = {}) {
	if (!Array.isArray(deps) || deps.length === 0) return []

	const queries = deps.map((d) => ({
		package: {
			name: d.name,
			ecosystem: d.ecosystem || 'npm',
		},
		version: d.version,
	}))

	const cacheKey = JSON.stringify(queries)
	const cached = osvCache.get(cacheKey)
	const now = Date.now()
	if (cached && now - cached.timestamp < CACHE_TTL_MS) {
		return cached.data
	}

	const fetchFn = options.fetchFn || globalThis.fetch
	if (typeof fetchFn !== 'function') return []

	const timeoutMs = options.timeout || 5000
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)

	try {
		const res = await fetchFn('https://api.osv.dev/v1/querybatch', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ queries }),
			signal: controller.signal,
		})

		clearTimeout(timer)
		if (!res.ok) return []

		const json = await res.json()
		const findings = []

		if (Array.isArray(json.results)) {
			for (let i = 0; i < json.results.length; i++) {
				const dep = deps[i]
				const result = json.results[i]
				if (Array.isArray(result.vulns)) {
					for (const vuln of result.vulns) {
						findings.push({
							package: dep.name,
							version: dep.version,
							id: vuln.id,
							summary: vuln.summary || vuln.details || 'Known vulnerability in package',
							severity: mapOsvSeverity(vuln),
							docsUrl: `https://osv.dev/vulnerability/${vuln.id}`,
						})
					}
				}
			}
		}

		osvCache.set(cacheKey, { timestamp: now, data: findings })
		return findings
	} catch {
		// Silent degradation when offline, timeout, or error
		return []
	} finally {
		clearTimeout(timer)
	}
}

function getCachedOsvVulnerabilities(deps = []) {
	if (!Array.isArray(deps) || deps.length === 0) return []
	const queries = deps.map((d) => ({
		package: {
			name: d.name,
			ecosystem: d.ecosystem || 'npm',
		},
		version: d.version,
	}))
	const cacheKey = JSON.stringify(queries)
	const cached = osvCache.get(cacheKey)
	const now = Date.now()
	if (cached && now - cached.timestamp < CACHE_TTL_MS) {
		return cached.data
	}
	return null
}

function clearOsvCache() {
	osvCache.clear()
}

module.exports = {
	extractProductionDepsFromLockfile,
	queryOsvVulnerabilities,
	mapOsvSeverity,
	getCachedOsvVulnerabilities,
	clearOsvCache,
}
