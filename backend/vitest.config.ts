import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    // Treat .js imports as .ts so vitest can resolve TypeScript source files.
    extensions: ['.ts', '.js'],
  },
});
