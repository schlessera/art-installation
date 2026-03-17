import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Port configuration - reads from environment (set by devports/justfile)
const FRONTEND_PORT = parseInt(process.env.GALLERY_FRONTEND_PORT || '5173', 10);
const API_PORT = process.env.GALLERY_PORT || '3001';
const API_URL = process.env.VITE_API_URL || `http://localhost:${API_PORT}`;

export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'), // Load .env from project root (rendered by devports)
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: FRONTEND_PORT,
    allowedHosts: true, // Allow connections from any host
    cors: true,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
      },
      '/images': {
        target: API_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
