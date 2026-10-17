import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { 'application/index': 'src/application/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: false,
  sourcemap: true,
  noExternal: ['@repo/contracts'],
  external: ['@repo/db'],
});
