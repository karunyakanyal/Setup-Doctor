const path = require('path');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function inspectVite() {
  console.log('Fetching vite...');
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  console.log('Building graph...');
  const result = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });

  const unresRule = result.summary.allRules.find((r) => r.id === 'unresolved-imports');
  console.log('Unresolved imports rule count:', unresRule ? unresRule.count : 0);
  console.log('Unresolved imports rule evidence:', unresRule ? unresRule.evidence : []);

  console.log('Summary.unresolvedImports length:', (result.summary.unresolvedImports || []).length);
  // Filter by production
  const prodUnres = (result.summary.unresolvedImports || []).filter(item => item.category === 'production');
  console.log('Production unresolvedImports length:', prodUnres.length);
  console.log('Production unresolvedImports sample:', prodUnres.slice(0, 10));

  console.log('All rules findings:');
  for (const r of result.summary.allRules) {
    if (r.count > 0) {
      console.log(`- ${r.id} (${r.severity}): count=${r.count}`);
    }
  }
}

inspectVite();
