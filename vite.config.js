import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app must run exclusively on http://localhost:3000
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
});
