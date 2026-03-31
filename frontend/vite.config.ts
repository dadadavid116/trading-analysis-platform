import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Allow connections from Docker host (for docker-compose dev usage)
    host: '0.0.0.0',
    port: 5173,

    // Proxy API requests to the backend during local development.
    // This avoids CORS issues when running frontend and backend separately.
    //
    // The target is read from the VITE_API_TARGET env var so it works in
    // both local and Docker contexts:
    //
    //   Local dev (npm run dev):     VITE_API_TARGET defaults to http://localhost:8000
    //   Docker Compose (dev stage):  Set VITE_API_TARGET=http://api:8000 in .env
    //                                so the container resolves the "api" service name.
    //
    // Note: VITE_API_TARGET is only used by the Vite dev server proxy.
    // In production (Nginx), the /api path is routed by the reverse proxy instead.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
