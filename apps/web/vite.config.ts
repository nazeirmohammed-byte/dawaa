import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
    fs: { allow: ['../..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4190',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    target: 'chrome109',
    cssTarget: 'chrome109',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
