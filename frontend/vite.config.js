import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy sends /api/... to the backend, so the browser never hits CORS problems.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } }
});
