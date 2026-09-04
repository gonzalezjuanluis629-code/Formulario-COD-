import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: { port: 3000, allowedHosts: true },
  resolve: {
    alias: {
      '@cod/contracts': pkg('../../packages/contracts/src/index.ts'),
      '@cod/pricing': pkg('../../packages/pricing/src/index.ts'),
      '@cod/geo': pkg('../../packages/geo/src/index.ts'),
    },
  },
  plugins: [reactRouter()],
});
