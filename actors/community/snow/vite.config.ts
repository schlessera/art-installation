import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Snow',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@art/types'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
