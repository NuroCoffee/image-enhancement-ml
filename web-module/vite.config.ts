import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages project URL:
  // https://nurocoffee.github.io/image-enhancement-ml/
  base: '/image-enhancement-ml/',

  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tensorflow')) return 'tensorflow';
          if (id.includes('heic-decode') || id.includes('libheif')) return 'heic';
          return undefined;
        },
      },
    },
  },

  worker: {
    format: 'es',
  },

  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
