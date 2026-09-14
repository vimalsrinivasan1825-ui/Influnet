import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Repairs `localStorage` for the files that opt into jsdom — Node 22's
    // experimental built-in shadows jsdom's and is inert without a CLI flag.
    // See tests/setup/web-storage.ts. No-op in the node environment.
    setupFiles: ['./tests/setup/web-storage.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
