import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // Ensure ethers is properly bundled
      target: 'es2020',
    },
  },
  build: {
    target: 'es2020',
  },
});