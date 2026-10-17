import { config } from 'dotenv';

config({ quiet: true });

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.LAB_WEB_PORT || 3200),
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.LAB_API_PORT || 3201}`,
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.LAB_API_PORT || 3201}` } },
  },
});
