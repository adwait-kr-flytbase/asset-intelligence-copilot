import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/runtime/index.ts'],
  outDir: 'dist/agent',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: ['@repo/contracts'],
});
