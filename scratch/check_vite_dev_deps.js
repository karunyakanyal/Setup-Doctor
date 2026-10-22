const path = require('path');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function checkViteDevDeps() {
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  const res = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });
  const devDepRule = res.summary.allRules.find(r => r.id === 'dev-dependency-in-production');
  console.log('Count:', devDepRule ? devDepRule.count : 0);
  console.log('Sample evidence:');
  for (const ev of (devDepRule ? devDepRule.evidence : [])) {
    console.log(ev);
  }
}

checkViteDevDeps();
