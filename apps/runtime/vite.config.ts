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
    host: '0.0.0.0', // Bind to all interfaces for external access
    open: false, // Don't auto-open browser (interferes with custom ports)
    allowedHosts: ['ccmux', 'localhost'], // Allow external access via ccmux hostname
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
