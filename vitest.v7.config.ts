import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/v7-final-gates.test.ts'],
    environment: 'node',
  },
});
