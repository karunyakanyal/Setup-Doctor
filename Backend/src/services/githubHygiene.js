const path = require('path')
const { ghFetch } = require('./github')
const { createRuleResult, formatSnippet } = require('./ruleEngine')

/**
 * Evaluate repository hygiene from local filesMap synchronously.
 */
function evaluateGithubHygieneSync({
	filesMap = new Map(),
}) {
	const findings = []
	const allFilePaths = Array.from(filesMap.keys())
	const workflowFiles = allFilePaths.filter(
		(f) => f.startsWith('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml'))
	)

	// 1. Security policy file
	const hasSecurityPolicy = allFilePaths.some((f) => {
		const lower = f.toLowerCase()
		return (
			lower === 'security.md' ||
			lower === '.github/security.md' ||
			lower === 'docs/security.md'
		)
	})
	const securityPolicyCount = hasSecurityPolicy || allFilePaths.length < 4 ? 0 : 1

	findings.push(
		createRuleResult({
			id: 'github-no-security-policy',
			name: 'Missing Security Policy',
			severity: 'nice-to-have',
			dimension: 'security',
			why:
				securityPolicyCount > 0
					? 'No security policy file (SECURITY.md) was found in the repository.'
					: 'Repository includes a SECURITY.md policy.',
			fix:
				securityPolicyCount > 0
					? 'Add a SECURITY.md file to document responsible vulnerability disclosure.'
					: 'No action required.',
			docsUrl: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
			evidence: securityPolicyCount > 0 ? [{ file: 'SECURITY.md', line: 1, snippet: 'Missing SECURITY.md' }] : [],
			count: securityPolicyCount,
		})
	)

	// 2. Dependabot or Renovate config
	const hasDepBot = allFilePaths.some((f) => {
		const lower = f.toLowerCase()
		return (
			lower === '.github/dependabot.yml' ||
			lower === '.github/dependabot.yaml' ||
			lower === 'dependabot.yml' ||
			lower === 'renovate.json' ||
			lower === 'renovate.json5' ||
			lower === '.renovaterc' ||
			lower === '.renovaterc.json' ||
			lower === '.renovaterc.json5' ||
			lower === '.renovaterc.js' ||
			lower === 'renovate.js' ||
			lower === '.github/renovate.json' ||
			lower === '.github/renovate.json5'
		)
	})
	const depBotCount = hasDepBot || allFilePaths.length < 4 ? 0 : 1

	findings.push(
		createRuleResult({
			id: 'github-no-dependabot',
			name: 'Missing Dependabot or Renovate Configuration',
			severity: 'nice-to-have',
			dimension: 'hygiene',
			why:
				depBotCount > 0
					? 'No Dependabot or Renovate configuration found for automated dependency updates.'
					: 'Automated dependency update tooling is configured.',
			fix:
				depBotCount > 0
					? 'Add a .github/dependabot.yml file to enable automated security and version updates.'
					: 'No action required.',
			docsUrl: 'https://docs.github.com/en/code-security/dependabot',
			evidence: depBotCount > 0 ? [{ file: '.github/dependabot.yml', line: 1, snippet: 'Missing dependabot config' }] : [],
			count: depBotCount,
		})
	)

	// 3. Workflow actions pinned to a version or commit
	const unpinnedActions = []
	for (const wf of workflowFiles) {
		const text = filesMap.get(wf)?.text || ''
		const lines = text.split(/\r?\n/)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const match = line.match(/uses:\s*([a-zA-Z0-9_\-./]+)@([a-zA-Z0-9_\-.]+)/)
			if (match) {
				const actionName = match[1]
				const ref = match[2]
				if (ref === 'main' || ref === 'master') {
					unpinnedActions.push({
						file: wf,
						line: i + 1,
						snippet: formatSnippet(line, 120),
						action: actionName,
						ref,
					})
				}
			}
		}
	}

	findings.push(
		createRuleResult({
			id: 'github-unpinned-action',
			name: 'Workflow Action Pinned to Mutable Branch',
			severity: 'important',
			dimension: 'security',
			why:
				unpinnedActions.length > 0
					? `Workflow action "${unpinnedActions[0].action}" in "${unpinnedActions[0].file}" is pinned to mutable branch "@${unpinnedActions[0].ref}".`
					: 'All GitHub Actions workflow actions are pinned to immutable releases or commit SHAs.',
			fix:
				unpinnedActions.length > 0
					? `Pin "${unpinnedActions[0].action}" to a full commit SHA or version tag in "${unpinnedActions[0].file}".`
					: 'No action required.',
			docsUrl: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions',
			evidence: unpinnedActions,
			count: unpinnedActions.length,
		})
	)

	// 4. Workflow permissions declared
	const workflowsWithoutPermissions = []
	for (const wf of workflowFiles) {
		const text = filesMap.get(wf)?.text || ''
		if (!/^\s*permissions\s*:/m.test(text)) {
			workflowsWithoutPermissions.push({
				file: wf,
				line: 1,
				snippet: 'Missing top-level permissions declaration',
			})
		}
	}

	findings.push(
		createRuleResult({
			id: 'github-no-workflow-permissions',
			name: 'Workflow Missing Explicit Permissions',
			severity: 'important',
			dimension: 'security',
			why:
				workflowsWithoutPermissions.length > 0
					? `Workflow file "${workflowsWithoutPermissions[0].file}" does not declare a permissions block.`
					: 'All CI workflows declare explicit permissions.',
			fix:
				workflowsWithoutPermissions.length > 0
					? `Add a top-level "permissions: read-all" (or least-privilege permissions) block to "${workflowsWithoutPermissions[0].file}".`
					: 'No action required.',
			docsUrl: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
			evidence: workflowsWithoutPermissions,
			count: workflowsWithoutPermissions.length,
		})
	)

	return findings
}

/**
 * Evaluate repository hygiene from local filesMap and GitHub API.
 * All API calls degrade silently (no finding) on failure or rate-limit.
 */
async function evaluateGithubHygiene({
	owner,
	repo,
	branch = 'main',
	filesMap = new Map(),
	isHealthRequest = false,
	options = {},
}) {
	const findings = evaluateGithubHygieneSync({ filesMap })

	// Skip remote GitHub API calls if isHealthRequest or owner/repo missing
	if (isHealthRequest || !owner || !repo) {
		return findings
	}

	const fetchFn = options.fetchFn || ghFetch

	// 5. Recent commits (maintained)
	try {
		const commitsRes = await fetchFn(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`,
			{ timeout: 5000 }
		)
		if (commitsRes.ok) {
			const commitsData = await commitsRes.json()
			if (Array.isArray(commitsData) && commitsData.length > 0) {
				const lastDateStr = commitsData[0]?.commit?.committer?.date || commitsData[0]?.commit?.author?.date
				if (lastDateStr) {
					const lastDate = new Date(lastDateStr)
					const daysAgo = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
					if (daysAgo > 180) {
						findings.push(
							createRuleResult({
								id: 'github-unmaintained',
								name: 'Repository Unmaintained (No Recent Commits)',
								severity: 'nice-to-have',
								dimension: 'hygiene',
								why: `Repository has had no commits in the last ${Math.round(daysAgo)} days (since ${lastDateStr.slice(0, 10)}).`,
								fix: 'Review repository maintenance status, update dependencies, and address open issues.',
								docsUrl: 'https://docs.github.com/en/repositories',
								evidence: [{ file: 'git-history', line: 1, snippet: `Latest commit on ${lastDateStr.slice(0, 10)}` }],
								count: 1,
							})
						)
					}
				}
			}
		}
	} catch {
		// Silent degradation when unavailable
	}

	// 6. Branch protection if readable
	try {
		const protectionRes = await fetchFn(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
			{ timeout: 5000 }
		)
		if (protectionRes.status === 404) {
			const errBody = await protectionRes.json().catch(() => ({}))
			if (errBody?.message && errBody.message.includes('Branch not protected')) {
				findings.push(
					createRuleResult({
						id: 'github-no-branch-protection',
						name: 'Default Branch Protection Not Enabled',
						severity: 'important',
						dimension: 'security',
						why: `Branch protection is not enabled on default branch "${branch}".`,
						fix: `Enable branch protection rules for "${branch}" in GitHub Settings > Branches.`,
						docsUrl: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches',
						evidence: [{ file: `branch:${branch}`, line: 1, snippet: 'Branch not protected' }],
						count: 1,
					})
				)
			}
		}
	} catch {
		// Silent degradation when unavailable
	}

	return findings
}

module.exports = {
	evaluateGithubHygiene,
	evaluateGithubHygieneSync,
}
