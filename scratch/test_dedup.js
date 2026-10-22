const fs = require('fs');
const path = require('path');

const graphPath = path.resolve(__dirname, '../Backend/src/services/graph.js');
let code = fs.readFileSync(graphPath, 'utf8').replace(/\r\n/g, '\n');

// 1. missing-engines-field dimension -> hygiene
code = code.replace(
	/id: 'missing-engines-field',\s*name: 'Missing Node Engine Specification',\s*severity: 'nice-to-have',\s*dimension: 'reliability',/,
	`id: 'missing-engines-field',\n\t\tname: 'Missing Node Engine Specification',\n\t\tseverity: 'nice-to-have',\n\t\tdimension: 'hygiene',`
);

// 2. Deduplicate missing-tests and no-test-script in allRules
const oldAllRules = `	const allRules = [...baseRules, ...projectFindings, ...hygieneFindings]`;
const newAllRules = `	// Deduplicate any overlapping base and project rules
	const combinedRules = [...baseRules, ...projectFindings, ...hygieneFindings]
	const seenRuleIds = new Set()
	const allRules = []
	for (const r of combinedRules) {
		if (r.id === 'no-test-script' && seenRuleIds.has('missing-tests')) continue
		if (r.id === 'missing-tests' && seenRuleIds.has('no-test-script')) continue
		if (seenRuleIds.has(r.id)) continue
		seenRuleIds.add(r.id)
		allRules.push(r)
	}`;

if (code.includes(oldAllRules)) {
	code = code.replace(oldAllRules, newAllRules);
	console.log('Deduplicated allRules in graph.js');
}

fs.writeFileSync(graphPath, code, 'utf8');
console.log('Updated graph.js');
