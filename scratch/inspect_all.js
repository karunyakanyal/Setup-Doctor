const path = require('path');
const fs = require('fs');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function inspectAll() {
  console.log('--- VITE ---');
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  const viteRes = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });
  console.log('Vite Profile:');
  console.log('Stacks:', viteRes.summary.profile.stacks);
  console.log('Routes:', viteRes.summary.profile.routes.length);
  console.log('EnvVars:', viteRes.summary.profile.envVars.length);
  console.log('Vite Findings:');
  for (const f of viteRes.summary.findings) {
    console.log(`[${f.severity}] ${f.id} (${f.count}): ${f.why}`);
    if (f.evidence && f.evidence.length > 0) {
      console.log('   Evidence:', f.evidence.slice(0, 2));
    }
  }

  console.log('\n--- SKINVEDA ---');
  const skin = await fetchRepoArchive('Amanyadav0556', 'Skinveda.ai', 'main');
  const skinRes = buildGraph(skin.files, [], { owner: 'Amanyadav0556', repo: 'Skinveda.ai' });
  console.log('Skinveda Profile:');
  console.log('Stacks:', skinRes.summary.profile.stacks);
  console.log('Routes:', skinRes.summary.profile.routes.length);
  console.log('EnvVars:', skinRes.summary.profile.envVars.length);
  console.log('Skinveda Findings:');
  for (const f of skinRes.summary.findings) {
    console.log(`[${f.severity}] ${f.id} (${f.count}): ${f.why}`);
    if (f.evidence && f.evidence.length > 0) {
      console.log('   Evidence:', f.evidence.slice(0, 2));
    }
  }

  console.log('\n--- SETUP-DOCTOR ---');
  // Read local Setup-Doctor files into Map
  const localFiles = new Map();
  function walkDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'brain' || ent.name === 'scratch') continue;
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
  const setupRes = buildGraph(localFiles, [], { owner: 'karunyakanyal', repo: 'Setup-Doctor' });
  console.log('Setup-Doctor Profile:');
  console.log('Stacks:', setupRes.summary.profile.stacks);
  console.log('Routes:', setupRes.summary.profile.routes.length);
  console.log('EnvVars:', setupRes.summary.profile.envVars.length);
  console.log('Setup-Doctor Findings:');
  for (const f of setupRes.summary.findings) {
    console.log(`[${f.severity}] ${f.id} (${f.count}): ${f.why}`);
    if (f.evidence && f.evidence.length > 0) {
      console.log('   Evidence:', f.evidence.slice(0, 2));
    }
  }
}

inspectAll();
