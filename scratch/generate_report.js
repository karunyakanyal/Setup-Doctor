const path = require('path');
const fs = require('fs');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function generateReport() {
  const repos = {};

  console.log('Fetching & analyzing Skinveda...');
  const skin = await fetchRepoArchive('Amanyadav0556', 'Skinveda.ai', 'main');
  repos['Skinveda'] = buildGraph(skin.files, [], { owner: 'Amanyadav0556', repo: 'Skinveda.ai' });

  console.log('Fetching & analyzing Vite...');
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  repos['vitejs/vite'] = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });

  console.log('Analyzing Setup-Doctor...');
  const localFiles = new Map();
  function walkDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'brain' || ent.name === 'scratch' || ent.name === 'dist') continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walkDir(full, rel);
      } else {
        try {
          const text = fs.readFileSync(full, 'utf8');
          localFiles.set(rel, { text });
        } catch {}
      }
    }
  }
  walkDir(path.resolve(__dirname, '..'));
  repos['Setup-Doctor'] = buildGraph(localFiles, [], { owner: 'karunyakanyal', repo: 'Setup-Doctor' });

  const summaryData = {};

  for (const [name, res] of Object.entries(repos)) {
    const p = res.summary.profile || {};
    const d = res.summary.dimensions || {};
    const findings = res.summary.findings || [];

    const criticalCount = findings.filter(f => f.severity === 'critical').reduce((acc, f) => acc + (f.count || 1), 0);
    const importantCount = findings.filter(f => f.severity === 'important').reduce((acc, f) => acc + (f.count || 1), 0);
    const niceCount = findings.filter(f => f.severity === 'nice-to-have').reduce((acc, f) => acc + (f.count || 1), 0);

    const secGrade = d.security?.grade || 'A';
    const relGrade = d.reliability?.grade || 'A';
    const mainGrade = d.maintainability?.grade || 'A';
    const hygGrade = d.hygiene?.grade || 'A';

    summaryData[name] = {
      stacks: (p.stacks || []).join(', '),
      routesCount: (p.routes || []).length,
      envVarsCount: (p.envVars || []).length,
      criticalCount,
      importantCount,
      niceCount,
      ratings: `S: ${secGrade} | R: ${relGrade} | M: ${mainGrade} | H: ${hygGrade}`,
      overallGrade: d.overallGrade || res.grade || 'A',
      capReason: d.capReason || res.capReason || 'None',
      findings,
      rawSummary: res.summary,
      nodesCount: res.nodes.length,
    };
  }

  console.log('\n=== SUMMARY DATA ===\n');
  console.log(JSON.stringify(summaryData, null, 2));
}

generateReport();
