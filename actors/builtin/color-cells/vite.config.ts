import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ColorCellsActor',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@art/types', '@art/actor-sdk'],
    },
  },
  resolve: {
    alias: {
      '@art/types': resolve(__dirname, '../../../packages/types/src'),
      '@art/actor-sdk': resolve(__dirname, '../../../packages/actor-sdk/src'),
    },
  },
});
