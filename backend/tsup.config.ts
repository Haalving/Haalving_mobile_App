import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  /* @haalving/shared is consumed as TypeScript source, so it is bundled in
     rather than resolved at runtime — there is no published artifact to point at. */
  noExternal: ['@haalving/shared'],
});
