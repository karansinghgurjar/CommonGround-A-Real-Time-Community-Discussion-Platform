import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.API_TARGET || env.API_TARGET || 'http://127.0.0.1:3001';
  const settings = { host: '127.0.0.1', port: Number(process.env.FRONTEND_PORT || env.FRONTEND_PORT) || 5173, strictPort: true, proxy: { '/api': target, '/uploads': target, '/socket.io': { target, ws: true } } };
  return { plugins: [react()], server: settings, preview: settings };
});
