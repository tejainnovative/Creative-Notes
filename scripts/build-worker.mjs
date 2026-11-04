// Bundles the Cloudflare Worker with Rolldown (Vite's bundler). Wrangler's own bundler, esbuild,
// is a separate .exe that group policy blocks on this machine; `wrangler deploy --no-bundle`
// then uploads this file as it is.
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'server/src/worker.ts',
  platform: 'neutral',
  external: [/^node:/, /^cloudflare:/],
  resolve: { conditionNames: ['workerd', 'worker', 'browser', 'import', 'default'], mainFields: ['module', 'main'] },
});
await bundle.write({ file: 'dist-worker/worker.js', format: 'esm', codeSplitting: false });
await bundle.close();
console.log('dist-worker/worker.js written');
