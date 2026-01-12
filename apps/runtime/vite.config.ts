import { defineConfig } from 'vite';
import { resolve } from 'path';

const projectRoot = resolve(__dirname, '../..');

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Allow importing from the actors folder at project root
      '/actors': resolve(projectRoot, 'actors'),
    },
  },
  server: {
    port: 3000,
    open: true,
    // Allow serving files from the actors folder
    fs: {
      allow: [
        // Project root (includes actors folder)
        projectRoot,
        // Node modules
        resolve(projectRoot, 'node_modules'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  optimizeDeps: {
    include: ['pixi.js'],
  },
});
