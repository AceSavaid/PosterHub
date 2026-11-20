/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { contentSecurityPolicy } from './csp';

// `base: './'` keeps every asset path relative, so the same build works on
// GitHub Pages (served from /<repo>/) and inside a desktop wrapper (file://).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Added to built pages only: the dev server needs inline scripts for hot reload.
    {
      name: 'posterhub-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`),
    },
  ],
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
