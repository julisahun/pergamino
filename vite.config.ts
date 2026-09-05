import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Pages, not one app with a router.
 *
 * `/` is the console and `/tv` the table screen — the same routes the server
 * serves — so there is no SPA fallback to get wrong, and each window loads
 * only the code it needs. `/api` and `/ws` are proxied to the server, which
 * `npm run dev` starts beside this one.
 */
export default defineConfig({
  root: 'app',
  plugins: [react()],
  server: {
    port: 5173,
    // The File System Access API needs a secure context. 127.0.0.1 is one.
    host: '127.0.0.1',
    proxy: {
      '/api': `http://127.0.0.1:${process.env.DM_PORT || 8085}`,
      '/ws': { target: `ws://127.0.0.1:${process.env.DM_PORT || 8085}`, ws: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'app/index.html'),
        tv: resolve(__dirname, 'app/tv.html'),
        pj: resolve(__dirname, 'app/pj.html'),
      },
    },
  },
})
