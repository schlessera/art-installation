import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CrystalGrowth',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@art/types'],
      output: {
        globals: {
          '@art/types': 'ArtTypes',
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
