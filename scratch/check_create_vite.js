const path = require('path');
const { fetchRepoArchive } = require(path.resolve(__dirname, '../Backend/src/services/archive'));

async function inspectCreateVite() {
  const vite = await fetchRepoArchive('vitejs', 'vite', 'main');
  const pkgData = vite.files.get('packages/create-vite/package.json');
  if (pkgData) {
    const json = JSON.parse(pkgData.text);
    console.log('packages/create-vite/package.json dependencies:', json.dependencies);
    console.log('packages/create-vite/package.json devDependencies:', json.devDependencies);
  } else {
    console.log('packages/create-vite/package.json not found');
  }
}

inspectCreateVite();
