const path = require('path');
const fs = require('fs');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));
const { buildGraph } = require(path.resolve(__dirname, '../Backend/src/services/graph'));

async function inspectReport() {
  console.log('Fetching & analyzing Skinveda...');
  const skin = await fetchRepoArchive('Amanyadav0556', 'Skinveda.ai', 'main');
  const skinRes = buildGraph(skin.files, [], { owner: 'Amanyadav0556', repo: 'Skinveda.ai' });

  console.log('Fetching & analyzing Vite...');
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  const viteRes = buildGraph(vite.files, [], { owner: 'vitejs', repo: 'vite' });

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
  const setupRes = buildGraph(localFiles, [], { owner: 'karunyakanyal', repo: 'Setup-Doctor' });

  const repos = {
    'Skinveda': skinRes,
    'vitejs/vite': viteRes,
    'Setup-Doctor': setupRes,
  };

  console.log('\n--- PART A: SUMMARY TABLE ---');
  for (const [name, res] of Object.entries(repos)) {
    const p = res.summary.profile || {};
    const d = res.summary.dimensions || {};
    const findings = res.summary.findings || [];

    const crit = findings.filter(f => f.severity === 'critical').reduce((acc, f) => acc + (f.count || 1), 0);
    const imp = findings.filter(f => f.severity === 'important').reduce((acc, f) => acc + (f.count || 1), 0);
    const nice = findings.filter(f => f.severity === 'nice-to-have').reduce((acc, f) => acc + (f.count || 1), 0);

    const s = d.security?.grade || 'A';
    const r = d.reliability?.grade || 'A';
    const m = d.maintainability?.grade || 'A';
    const h = d.hygiene?.grade || 'A';

    console.log({
      repo: name,
      stacks: p.stacks,
      routes: (p.routes || []).length,
      envVars: (p.envVars || []).length,
      critical: crit,
      important: imp,
      niceToHave: nice,
      ratings: `S: ${s}, R: ${r}, M: ${m}, H: ${h}`,
      overallGrade: d.overallGrade || res.grade,
      capReason: d.capReason || res.capReason || 'None',
    });
  }

  console.log('\n--- PART B: 5 MOST SURPRISING FINDINGS PER REPO ---');
  for (const [name, res] of Object.entries(repos)) {
    console.log(`\n[Repo: ${name}]`);
    const findings = res.summary.findings || [];
    // Sort by count or uniqueness
    const sorted = [...findings].sort((a, b) => (b.count || 1) - (a.count || 1));
    const top5 = sorted.slice(0, 5);
    for (const f of top5) {
      console.log(`- [${f.severity}] ${f.id} (${f.count}): ${f.why}`);
      if (f.evidence && f.evidence[0]) {
        console.log(`   Evidence: ${f.evidence[0].file}:${f.evidence[0].line} -> "${f.evidence[0].snippet}"`);
      }
    }
  }

  console.log('\n--- PART C: VITE & SKINVEDA REGRESSION CHECKS ---');
  console.log('Vite:');
  console.log('- cycles:', viteRes.summary.cycles.length);
  console.log('- orphans:', viteRes.summary.orphans.length);
  const viteProdUnres = (viteRes.summary.unresolvedImports || []).filter(item => item.category === 'production');
  console.log('- unresolved production (build outputs):', viteProdUnres.length, viteProdUnres.map(i => i.specifier));
  console.log('- usedButUndeclared:', viteRes.summary.usedButUndeclared);

  console.log('Skinveda:');
  console.log('- mapped nodes:', skinRes.nodes.length);
  console.log('- cycles:', skinRes.summary.cycles.length);
  console.log('- orphans:', skinRes.summary.orphans.length);
}

inspectReport();
