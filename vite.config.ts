import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the React runtime in a stable chunk so app-code changes don't
        // invalidate its cache. cron-parser/luxon are deliberately excluded:
        // they must stay in the lazily imported chunk, not an eager one.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('cron-parser') || id.includes('luxon')) return undefined;
          return 'vendor';
        },
      },
    },
  },
});
