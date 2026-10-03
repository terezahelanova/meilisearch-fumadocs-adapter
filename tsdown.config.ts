import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  target: 'es2023',
  format: 'esm',
  entry: ['src/index.ts', 'src/client.ts'],
});
