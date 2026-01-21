import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// API URL for proxy - configurable via environment variable
const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Bind to all interfaces for external access
    allowedHosts: ['ccmux', 'localhost'], // Allow external access via ccmux hostname
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
