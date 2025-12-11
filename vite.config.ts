import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
      base: './', // Required for Electron to load assets correctly
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
          external: [
            // Exclude native modules and Electron from bundling
            'keytar',
            'electron',
            /^electron\/.*/,
          ],
        },
      },
      optimizeDeps: {
        // Exclude native modules from pre-bundling
        exclude: ['keytar'],
      },
});
 