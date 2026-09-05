// One file for the Pi: the server and every module it imports, `ws` included.
// The two externals are ws's optional native accelerators, which it requires
// inside a try/catch and does without.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'server/dist/index.mjs',
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: 'info',
})
