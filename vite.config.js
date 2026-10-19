import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks only to this dev server; /mower/* is forwarded to the
// GIGA, so no cross-origin or local-network browser permission is involved.
// Override the GIGA address with: MOWER_URL=http://<ip> npm run dev
const MOWER_URL = process.env.MOWER_URL || 'http://172.20.10.13';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/mower': {
        target: MOWER_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mower/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/mower': {
        target: MOWER_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mower/, ''),
      },
    },
  },
});
