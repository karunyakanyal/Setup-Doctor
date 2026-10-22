const fs = require('fs');
const path = require('path');

// 1. Fix dimensions.js caps
const dimPath = path.resolve(__dirname, '../Backend/src/services/dimensions.js');
let dimCode = fs.readFileSync(dimPath, 'utf8').replace(/\r\n/g, '\n');

dimCode = dimCode.replace(
	`			capReason = secretsCount > 0
				? 'Security: committed secrets (committed-secrets)'
				: 'Security: known critical vulnerability (known-vulnerabilities)'`,
	`			capReason = secretsCount > 0 ? 'committed secret' : 'known critical vulnerability'`
);

dimCode = dimCode.replace(
	`			capReason = undeclaredCount > 0
				? \`Hygiene: \${undeclaredCount} undeclared \${undeclaredCount === 1 ? 'package' : 'packages'} (undeclared-packages)\`
				: 'Reliability: failed critical diagnostic'`,
	`			capReason = undeclaredCount > 0
				? \`\${undeclaredCount} undeclared \${undeclaredCount === 1 ? 'package' : 'packages'}\`
				: 'failed critical diagnostic'`
);

dimCode = dimCode.replace(
	`			capReason = \`Reliability: \${runtimeCyclesCount} runtime \${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'} (runtime-cycles)\``,
	`			capReason = \`\${runtimeCyclesCount} runtime \${runtimeCyclesCount === 1 ? 'cycle' : 'cycles'}\``
);

dimCode = dimCode.replace(
	`			capReason = isTruncated ? 'Reliability: Code Map scan truncated' : 'Reliability: Code Map scan failed'`,
	`			capReason = isTruncated ? 'Code Map scan truncated' : 'Code Map scan failed'`
);

fs.writeFileSync(dimPath, dimCode, 'utf8');
console.log('Fixed dimensions.js explicit caps');

// 2. Fix projectRules.js unvalidated routes count
const prPath = path.resolve(__dirname, '../Backend/src/services/projectRules.js');
let prCode = fs.readFileSync(prPath, 'utf8').replace(/\r\n/g, '\n');

prCode = prCode.replace(
	`evidence: unvalidatedRoutes,\n\t\t\t\tcount: unvalidatedPkgs.size,`,
	`evidence: unvalidatedRoutes,\n\t\t\t\tcount: unvalidatedRoutes.length,`
);

fs.writeFileSync(prPath, prCode, 'utf8');
console.log('Fixed projectRules.js unvalidatedRoutes count');
