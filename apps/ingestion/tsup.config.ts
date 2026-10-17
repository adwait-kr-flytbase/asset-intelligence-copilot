import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/cli.ts', 'src/embed-cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
});
