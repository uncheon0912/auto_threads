import { defineConfig } from 'vite';
import process from 'node:process';

const releaseRepository=process.env.THREADS_AUTO_RELEASE_REPOSITORY || 'uncheon0912/auto_threads-releases';
if(!/^[\w.-]+\/[\w.-]+$/.test(releaseRepository))throw new Error('THREADS_AUTO_RELEASE_REPOSITORY must be owner/repository');

export default defineConfig({
  define: { THREADS_AUTO_RELEASE_REPOSITORY: JSON.stringify(releaseRepository) },
  build: {
    rollupOptions: { external: ['better-sqlite3'], output: { entryFileNames: 'main.js' } },
  },
});
