import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// El widget corre en el navegador (ESM y self-contained): resolvemos los
// packages del monorepo a su CÓDIGO FUENTE para que Vite los empaquete,
// en vez de usar su build CommonJS (pensado para el backend Node).
const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Dos entradas:
 *  - widget.js  → el que carga la tienda (objetivo: < 40 KB gzip)
 *  - preview.js → el que carga el iframe del panel
 *
 * El mapa va en un chunk aparte (import dinámico): solo se descarga si el
 * cliente pulsa "Usar mi ubicación". El bundle base no lo paga.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@cod/contracts': pkg('../../packages/contracts/src/index.ts'),
      '@cod/pricing': pkg('../../packages/pricing/src/index.ts'),
      '@cod/geo': pkg('../../packages/geo/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: { widget: 'src/index.ts', preview: 'src/preview.ts' },
      formats: ['es'],
    },
    minify: 'terser',
    terserOptions: { compress: { drop_console: true, passes: 2 } },
    rollupOptions: { output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' } },
    target: 'es2019',
  },
});
