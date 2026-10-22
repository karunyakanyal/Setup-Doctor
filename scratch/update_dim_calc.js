const fs = require('fs');
const path = require('path');

const dimPath = path.resolve(__dirname, '../Backend/src/services/dimensions.js');
let code = fs.readFileSync(dimPath, 'utf8').replace(/\r\n/g, '\n');

const oldRatingCalc = `	if (dimensionName === 'reliability') {
		// "a runtime cycle caps Reliability at B, never lower. E needs many critical findings."
		const nonCycleCrit = failingRules.filter((r) => r.severity === 'critical' && r.id !== 'runtime-cycles')
		const nonCycleCritCount = nonCycleCrit.reduce((acc, r) => acc + (r.count || 1), 0)
		const hasCycles = failingRules.some((r) => r.id === 'runtime-cycles')

		if (nonCycleCritCount >= 4) {
			grade = 'E' // E needs many critical findings
		} else if (nonCycleCritCount >= 2) {
			grade = 'D'
		} else if (nonCycleCritCount === 1) {
			grade = 'C'
		} else if (impCount >= 3 || rawScore < 70) {
			grade = 'D'
		} else if (impCount >= 2 || rawScore < 80) {
			grade = 'C'
		} else if (hasCycles || impCount === 1 || niceCount >= 3 || rawScore < 90) {
			grade = 'B'
		} else {
			grade = 'A'
		}
	} else {
		// Security, Maintainability, Hygiene
		if (critCount >= 4) {
			grade = 'E' // E needs many critical findings
		} else if (critCount >= 2) {
			grade = 'D'
		} else if (critCount === 1) {
			grade = 'C'
		} else if (impCount >= 3 || rawScore < 70) {
			grade = 'D'
		} else if (impCount >= 2 || rawScore < 80) {
			grade = 'C'
		} else if (impCount === 1 || niceCount >= 3 || rawScore < 90) {
			grade = 'B'
		} else {
			grade = 'A'
		}
	}`;

const newRatingCalc = `	let finalScore = rawScore

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
	}`;

if (code.includes(oldRatingCalc)) {
	code = code.replace(oldRatingCalc, newRatingCalc);
	code = code.replace('score: rawScore,', 'score: finalScore,');
	fs.writeFileSync(dimPath, code, 'utf8');
	console.log('Successfully updated dimensions.js rating calculation');
} else {
	console.log('Could not find oldRatingCalc');
}
