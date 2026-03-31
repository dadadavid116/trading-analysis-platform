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
    // The backend runs at http://localhost:8000 by default.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
