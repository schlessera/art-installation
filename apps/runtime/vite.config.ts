import { defineConfig } from 'vite';
import { resolve } from 'path';

const projectRoot = resolve(__dirname, '../..');
const PORT = parseInt(process.env.RUNTIME_PORT || '3000', 10);

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
    port: PORT,
    strictPort: true,
    open: false, // Don't auto-open browser (interferes with custom ports)
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
