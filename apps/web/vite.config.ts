import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: Number(env.WEB_PORT || 3000),
      strictPort: true,
      proxy: {
        '/api': { target: env.VITE_API_TARGET || 'http://127.0.0.1:3001', changeOrigin: true },
      },
    },
  };
});
