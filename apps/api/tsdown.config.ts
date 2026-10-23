import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { server: 'src/server.ts' },
  platform: 'node',
  format: 'esm',
  outDir: 'dist',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: true,
  deps: { alwaysBundle: [/^@pm\/shared/], onlyBundle: ['fractional-indexing'] },
})
