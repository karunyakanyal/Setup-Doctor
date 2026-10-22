const path = require('path');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function testFetch() {
  console.log('Testing Skinveda archive fetch...');
  try {
    const skinveda = await fetchRepoArchive('Amanyadav0556', 'Skinveda.ai', 'main');
    console.log('Skinveda files count:', skinveda.files.size);
    const skinResult = buildGraph(skinveda.files, [], { owner: 'Amanyadav0556', repo: 'Skinveda.ai' });
    console.log('Skinveda nodes mapped:', skinResult.nodes.length);
    console.log('Skinveda cycles:', skinResult.summary.cycles.length);
    console.log('Skinveda orphans:', skinResult.summary.orphans.length);
  } catch (err) {
    console.error('Skinveda fetch error:', err.message, err.status);
  }

  console.log('Testing vite archive fetch...');
  try {
    const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
    console.log('Vite files count:', vite.files.size);
    const viteResult = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });
    console.log('Vite nodes mapped:', viteResult.nodes.length);
    console.log('Vite cycles:', viteResult.summary.cycles.length);
    console.log('Vite orphans:', viteResult.summary.orphans.length);
    console.log('Vite unresolved:', viteResult.summary.unresolvedCount);
    console.log('Vite usedButUndeclared:', viteResult.summary.usedButUndeclared);
  } catch (err) {
    console.error('Vite fetch error:', err.message, err.status);
  }
}

testFetch();
