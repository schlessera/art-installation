import { defineConfig } from 'vite';

export default defineConfig({
  root: 'preview',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@art/types': '../../../packages/types/src',
      '@art/actor-sdk': '../../../packages/actor-sdk/src',
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
