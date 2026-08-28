import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Two pages, not one app with a router.
 *
 * `/` is the console and `/tv` is the table screen — the same two routes the
 * Python host serves — so there is no SPA fallback to get wrong, and the table
 * window loads only the code it needs. Nothing is proxied: there is no server
 * to proxy to any more.
 */
export default defineConfig({
  root: 'app',
  plugins: [react()],
  server: {
    port: 5173,
    // The File System Access API needs a secure context. 127.0.0.1 is one.
    host: '127.0.0.1',
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'app/index.html'),
        tv: resolve(__dirname, 'app/tv.html'),
      },
    },
  },
})
