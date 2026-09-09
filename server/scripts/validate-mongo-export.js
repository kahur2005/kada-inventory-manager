const fs = require('fs/promises');
const path = require('path');
const { buildManifest, readExport, validateSnapshot } = require('./migration-data');

async function main() {
  const directory = path.resolve(process.argv[2] || '.');
  const snapshot = await readExport(directory);
  const errors = validateSnapshot(snapshot);
  const manifest = buildManifest(snapshot, errors);
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
