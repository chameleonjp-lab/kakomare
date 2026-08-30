import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kakomare/',
  build: {
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    host: '0.0.0.0',
  },
});
