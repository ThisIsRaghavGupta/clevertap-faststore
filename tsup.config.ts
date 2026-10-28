import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: false, // keep dist/runtime.iife.js written by build-runtime.mjs
  external: ['react'],
  target: 'es2019',
  sourcemap: false,
})
