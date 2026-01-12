import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SynthwaveHorizon',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      // Don't bundle these - they'll be provided by the runtime
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
