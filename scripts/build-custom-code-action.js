const esbuild = require('esbuild');
const path = require('path');

async function build() {
  const rootDir = path.resolve(__dirname, '..');
  const entryPoint = path.join(rootDir, 'src', 'custom-code-actions', 'reconcile-record.ts');
  const outFile = path.join(rootDir, 'dist', 'hubspot-custom-code', 'reconcile-record.js');

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: outFile,
    external: ['@hubspot/api-client']
  });

  console.log(`[esbuild] Successfully bundled Custom Code Action -> dist/hubspot-custom-code/reconcile-record.js`);
}

build().catch((err) => {
  console.error('Build script error:', err);
  process.exit(1);
});
