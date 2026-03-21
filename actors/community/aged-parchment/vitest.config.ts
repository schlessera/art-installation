import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@art/types': '../types/src',
      '@art/actor-sdk': '../actor-sdk/src',
    },
  },
});
