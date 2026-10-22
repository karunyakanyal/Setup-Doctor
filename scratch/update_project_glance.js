const fs = require('fs');

let content = fs.readFileSync('frontend/src/utils/projectGlance.js', 'utf8');

// 1. In getHealthVerdict, after checking score and grade from deepScanData
const targetScore = `  if (typeof deepScanData?.score === 'number' && typeof deepScanData?.grade === 'string') {
    finalScore = deepScanData.score
    finalGrade = deepScanData.grade
    capReason = deepScanData.capReason || null
  }`;

const replacementScore = `  if (typeof deepScanData?.score === 'number' && typeof deepScanData?.grade === 'string') {
    finalScore = deepScanData.score
    finalGrade = deepScanData.grade
    capReason = deepScanData.capReason || null
  }

  const dimensions = deepScanData?.dimensions || deepScanData?.summary?.dimensions
  if (dimensions?.overallGrade) {
    finalGrade = dimensions.overallGrade
    if (dimensions.capReason) {
      capReason = dimensions.capReason
    }
  }

  const findingsList = deepScanData?.findings || deepScanData?.summary?.findings || []
  const hasSecrets = findingsList.some((f) => f.id === 'committed-secrets' || f.id === 'env-tracked')
  const hasCriticalVulns = findingsList.some((f) => f.id === 'known-vulnerabilities' && f.severity === 'critical')
  if (hasSecrets || hasCriticalVulns) {
    if (finalGrade === 'A' || finalGrade === 'B' || finalGrade === 'C') {
      finalGrade = 'C'
      finalScore = Math.min(finalScore, 79)
      capReason = hasSecrets ? 'committed secrets found' : 'known critical vulnerabilities'
    }
  }`;

// 2. In getWhatToDoNext, before steps.sort
const targetSteps = `  // Sort by severity (Critical -> Important -> Nice to have)
  steps.sort((a, b) => a.severityOrder - b.severityOrder)`;

const replacementSteps = `  // 8. Rule engine findings (Phase 1-4 rules)
  const rawFindings = deepScanData?.findings || deepScanData?.summary?.findings || []
  const genericRuleIds = new Set([
    'runtime-cycles',
    'undeclared-packages',
    'unresolved-imports',
    'orphans',
    'unused-dependencies',
  ])

  for (let idx = 0; idx < rawFindings.length; idx++) {
    const f = rawFindings[idx]
    if (!f || !f.id) continue
    if (genericRuleIds.has(f.id)) continue

    const s = f.severity?.toLowerCase()
    const sevLabel = s === 'critical' ? 'Critical' : (s === 'important' ? 'Important' : 'Nice to have')
    const sevOrder = s === 'critical' ? 0.15 : (s === 'important' ? 1.3 : 2.2)

    let action = null
    if (f.evidence && f.evidence[0]?.file) {
      action = {
        type: 'file',
        value: f.evidence[0].file,
        label: \`Inspect \${f.evidence[0].file}\`,
      }
    } else if (f.fix) {
      action = {
        type: 'command',
        value: f.fix,
        label: f.fix,
      }
    } else {
      action = {
        type: 'command',
        value: f.name || f.id,
        label: f.name || f.id,
      }
    }

    steps.push({
      id: \`rule-\${f.id}-\${idx}\`,
      severity: sevLabel,
      severityOrder: sevOrder,
      title: f.name || f.id,
      why: f.why || 'Identified by project rule analysis.',
      action,
      docsUrl: f.docsUrl,
    })
  }

  // Sort by severity (Critical -> Important -> Nice to have)
  steps.sort((a, b) => a.severityOrder - b.severityOrder)`;

// Normalize newlines
const normContent = content.replace(/\r\n/g, '\n');
const normTargetScore = targetScore.replace(/\r\n/g, '\n');
const normReplacementScore = replacementScore.replace(/\r\n/g, '\n');
const normTargetSteps = targetSteps.replace(/\r\n/g, '\n');
const normReplacementSteps = replacementSteps.replace(/\r\n/g, '\n');

if (!normContent.includes(normTargetScore)) {
  console.error('Target score not found');
  process.exit(1);
}
if (!normContent.includes(normTargetSteps)) {
  console.error('Target steps not found');
  process.exit(1);
}

let updated = normContent.replace(normTargetScore, normReplacementScore);
updated = updated.replace(normTargetSteps, normReplacementSteps);

// restore CRLF if original was CRLF
if (content.includes('\r\n')) {
  updated = updated.replace(/\n/g, '\r\n');
}

fs.writeFileSync('frontend/src/utils/projectGlance.js', updated, 'utf8');
console.log('Successfully updated projectGlance.js');
