import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});
