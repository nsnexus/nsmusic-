import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@cloudflare/next-on-pages': path.resolve(dirname, './tests/stubs/next-on-pages.js'),
      '@': path.resolve(dirname, './src'),
    },
  },
});
