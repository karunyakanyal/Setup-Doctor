/**
 * ============================================================================
 * SETUP-DOCTOR DIMENSION RATING AND GRADE FORMULA
 * ============================================================================
 *
 * 1. PER-CHECK SCORING (0 to 10 points per check):
 *    - Each rule/check starts with a perfect score of 10 if count === 0.
 *    - When findings occur (count > 0):
 *        * Critical severity: score = max(0, 10 - 7 - (count - 1) * 1) [0 to 3]
 *        * Important severity: score = max(2, 10 - 4 - (count - 1) * 0.5) [2 to 6]
 *        * Nice-to-have severity: score = max(5, 10 - 2 - (count - 1) * 0.2) [5 to 8]
 *
 * 2. FOUR DIMENSION RATINGS (A to E):
 *    Rules are grouped into 4 dimensions: Security, Reliability, Maintainability, Hygiene.
 *    For each dimension:
 *      - Dimension score (0-100) starts at 100 and applies deductions:
 *          Critical: 25 + min(25, (count - 1) * 10) per rule
 *          Important: 12 + min(18, (count - 1) * 5) per rule
 *          Nice-to-have: 4 + min(6, (count - 1) * 2) per rule
 *      - Dimension Grade (A to E):
 *          * E needs many critical findings (>= 4 critical findings).
 *          * D: 2-3 critical findings, or >= 3 important findings, or score < 70.
 *          * C: 1 critical finding, or >= 2 important findings, or score < 80.
 *          * B: 1 important finding, >= 3 nice-to-have findings, or score < 90.
 *          * A: Score >= 90 with 0 critical, 0 important, and <= 2 nice-to-have.
 *          * Special Reliability rule: A runtime cycle caps Reliability at B, never lower.
 *
 * 3. OVERALL GRADE DETERMINATION:
 *    - The base overall grade is the WORST dimension among the four (A to E):
 *        worst(Grade(Security), Grade(Reliability), Grade(Maintainability), Grade(Hygiene))
 *    - Grade Caps (Applied on top of worst dimension):
 *        * Secrets or known critical vulnerabilities: caps overall grade at max 'C' (score <= 79).
 *        * Undeclared packages or failed critical diagnostic: caps overall grade at max 'C' (score <= 79).
 *        * Runtime circular dependencies: caps overall grade at max 'B' (score <= 89).
 *        * Truncated or failed Code Map scan: caps overall grade at max 'B' (score <= 89).
 *    - capReason: Whenever overall grade is below A, capReason names the dimension and
 *      the specific finding that caused it (never 'None' when grade is below A).
 *
 * ============================================================================
 */

const DIMENSIONS = ['security', 'reliability', 'maintainability', 'hygiene']

function scoreCheck(rule) {
	if (!rule || typeof rule.count !== 'number' || rule.count <= 0) {
		return 10
	}
	const count = rule.count
	if (rule.severity === 'critical') {
		return Math.max(0, Math.round(10 - 7 - (count - 1) * 1))
	}
	if (rule.severity === 'important') {
		return Math.max(2, Math.round(10 - 4 - (count - 1) * 0.5))
	}
	return Math.max(5, Math.round(10 - 2 - (count - 1) * 0.2))
}

function calculateDimensionRating(dimensionName, rulesInDimension) {
	let deductions = 0
	let critCount = 0
	let impCount = 0
	let niceCount = 0
	const failingRules = []

	for (const r of rulesInDimension) {
		r.score = scoreCheck(r)
		if (r.count > 0) {
			failingRules.push(r)
			if (r.severity === 'critical') {
				critCount += r.count
				deductions += 25 + Math.min(25, (r.count - 1) * 10)
			} else if (r.severity === 'important') {
				impCount += r.count
				deductions += 12 + Math.min(18, (r.count - 1) * 5)
			} else {
				niceCount += r.count
				deductions += 4 + Math.min(6, (r.count - 1) * 2)
			}
		}
	}

	const rawScore = Math.max(0, Math.min(100, Math.round(100 - deductions)))
	let grade = 'A'

	let finalScore = rawScore

	if (dimensionName === 'reliability') {
		// User rule: "a runtime cycle caps Reliability at B, never lower. E needs many critical findings."
		const nonCycleCrit = failingRules.filter((r) => r.severity === 'critical' && r.id !== 'runtime-cycles')
		const nonCycleCritCount = nonCycleCrit.reduce((acc, r) => acc + (r.count || 1), 0)
		const hasCycles = failingRules.some((r) => r.id === 'runtime-cycles')

		if (nonCycleCritCount >= 4) {
			grade = 'E' // E needs many critical findings
		} else if (nonCycleCritCount >= 2) {
			grade = 'D'
		} else if (nonCycleCritCount === 1) {
			grade = 'C'
		} else if (impCount >= 3) {
			grade = 'D'
		} else if (impCount >= 2) {
			grade = 'C'
		} else if (hasCycles || impCount === 1 || niceCount >= 3) {
			grade = 'B' // Capped at B, never lower from cycles
			finalScore = Math.max(80, Math.min(88, rawScore || 85))
		} else {
			grade = 'A'
		}
	} else {
		// Security, Maintainability, Hygiene
		// "E needs many critical findings."
		if (critCount >= 4) {
			grade = 'E' // E needs many critical findings
		} else if (critCount >= 2) {
			grade = 'D'
		} else if (critCount === 1) {
			grade = 'C'
		} else if (impCount >= 3) {
			grade = 'D'
		} else if (impCount >= 2) {
			grade = 'C'
		} else if (impCount === 1 || niceCount >= 3) {
			grade = 'B'
		} else {
			grade = 'A'
		}
	}

	let reason = 'Healthy with no issues detected.'
	if (failingRules.length > 0) {
		const top = failingRules[0]
		reason = top.why || `${top.name}: ${top.count} issue(s) detected.`
	} else {
		if (dimensionName === 'security') reason = 'No security issues or committed secrets detected.'
		else if (dimensionName === 'reliability') reason = 'No reliability or circular dependency issues detected.'
		else if (dimensionName === 'maintainability') reason = 'Code structure is maintainable with no orphans.'
		else if (dimensionName === 'hygiene') reason = 'Repository hygiene and dependency declarations are healthy.'
	}

	return {
		dimension: dimensionName,
		grade,
		score: finalScore,
		reason,
		findingsCount: failingRules.length,
		checks: rulesInDimension,
	}
}

const GRADE_ORDER = { A: 4, B: 3, C: 2, D: 1, E: 0, F: 0 }
const GRADE_LETTERS = ['E', 'D', 'C', 'B', 'A']

function worstGrade(grades) {
	let worstVal = 4
	for (const g of grades) {
		const val = GRADE_ORDER[g] ?? 0
		if (val < worstVal) {
			worstVal = val
		}
	}
	return GRADE_LETTERS[worstVal] || 'E'
}

function calculateDimensionsAndGrade(rules = [], options = {}) {
	const rulesByDimension = {
		security: [],
		reliability: [],
		maintainability: [],
		hygiene: [],
	}

	for (const r of rules) {
		const dim = r.dimension && rulesByDimension[r.dimension] ? r.dimension : 'hygiene'
		rulesByDimension[dim].push(r)
	}

	const dimensions = {}
	const dimGrades = []
	let totalDimScore = 0

	for (const dim of DIMENSIONS) {
		const result = calculateDimensionRating(dim, rulesByDimension[dim])
		dimensions[dim] = result
		dimGrades.push(result.grade)
		totalDimScore += result.score
	}

	const worstDimGrade = worstGrade(dimGrades)
	const avgScore = Math.round(totalDimScore / DIMENSIONS.length)

	// Caps evaluation
	const rulesMap = new Map()
	for (const r of rules) {
		if (r && r.id) rulesMap.set(r.id, r)
	}

	const undeclaredCount = rulesMap.get('undeclared-packages')?.count || 0
	const runtimeCyclesCount = rulesMap.get('runtime-cycles')?.count || 0
	const secretsCount = (rulesMap.get('committed-secrets')?.count || 0) + (rulesMap.get('vite-secrets-in-env')?.count || 0)
	const knownVulnRule = rulesMap.get('known-vulnerabilities')
	const hasCriticalVuln = knownVulnRule && knownVulnRule.severity === 'critical' && knownVulnRule.count > 0

	const hasFailedCriticalDiag = Boolean(options.hasFailedCriticalDiagnostic)
	const isTruncated = Boolean(options.truncated)
	const isFailedScan = Boolean(options.failed)

	let finalGrade = worstDimGrade
	let finalScore = avgScore
	let capReason = null

	// 1. Secrets or known critical vulnerabilities cap at C
	if (secretsCount > 0 || hasCriticalVuln) {
		if (GRADE_ORDER[finalGrade] >= GRADE_ORDER['C']) {
			finalGrade = 'C'
			finalScore = Math.min(finalScore, 79)
			capReason = secretsCount > 0 ? 'committed secret' : 'known critical vulnerability'
		}
	}

	// 2. Undeclared packages or failed critical diagnostic cap at C
	if (undeclaredCount > 0 || hasFailedCriticalDiag) {
		if (GRADE_ORDER[finalGrade] >= GRADE_ORDER['C']) {
			finalGrade = 'C'
			finalScore = Math.min(finalScore, 79)
			capReason = undeclaredCount > 0
				? `${undeclaredCount} undeclared ${undeclaredCount === 1 ? 'package' : 'packages'}`
				: 'failed critical diagnostic'
		}
	}

	// 3. Runtime cycles cap at B
	if (runtimeCyclesCount > 0) {
		if (GRADE_ORDER[finalGrade] >= GRADE_ORDER['B']) {
			finalGrade = 'B'
			finalScore = Math.min(finalScore, 89)
			capReason = `${runtimeCyclesCount} runtime ${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'}`
		}
	}

	// 4. Truncated or failed scan cap at B
	if (isTruncated || isFailedScan) {
		if (GRADE_ORDER[finalGrade] >= GRADE_ORDER['B']) {
			finalGrade = 'B'
			finalScore = Math.min(finalScore, 89)
			capReason = isTruncated ? 'Code Map scan truncated' : 'Code Map scan failed'
		}
	}

	// User requirement: "Overall grade is the worst dimension, and capReason must name
	// the dimension and the finding that caused it (never 'None' when the grade is below A)."
	if (finalGrade !== 'A' && !capReason) {
		// Find the worst dimension among the 4 dimensions
		const worstDimObj = DIMENSIONS
			.map((d) => dimensions[d])
			.filter(Boolean)
			.sort((a, b) => {
				const diff = (GRADE_ORDER[a.grade] ?? 4) - (GRADE_ORDER[b.grade] ?? 4)
				if (diff !== 0) return diff
				return a.score - b.score
			})[0]

		if (worstDimObj) {
			const topFailingCheck = (worstDimObj.checks || [])
				.filter((c) => c.count > 0)
				.sort((a, b) => {
					const sevOrder = { critical: 3, important: 2, 'nice-to-have': 1 }
					const sevDiff = (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0)
					if (sevDiff !== 0) return sevDiff
					return (b.count || 0) - (a.count || 0)
				})[0]

			const dimLabel = worstDimObj.dimension.charAt(0).toUpperCase() + worstDimObj.dimension.slice(1)
			if (topFailingCheck) {
				const checkName = (topFailingCheck.id === 'missing-tests' || topFailingCheck.id === 'no-test-script')
					? 'no automated tests'
					: (topFailingCheck.id === 'missing-license' ? 'missing license' : (topFailingCheck.name ? topFailingCheck.name.toLowerCase() : worstDimObj.reason))
				capReason = `Capped at ${finalGrade} by ${dimLabel}: ${checkName}`
			} else {
				capReason = `Capped at ${finalGrade} by ${dimLabel}: ${worstDimObj.reason}`
			}
		}
	}

	return {
		score: finalScore,
		grade: finalGrade,
		capReason,
		rawScore: avgScore,
		rawGrade: worstDimGrade,
		worstDimension: worstDimGrade,
		dimensions,
	}
}

module.exports = {
	calculateDimensionsAndGrade,
	calculateDimensionRating,
	scoreCheck,
	worstGrade,
	DIMENSIONS,
}
