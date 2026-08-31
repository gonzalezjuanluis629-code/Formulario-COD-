import { defineConfig } from 'vite';

/**
 * Dos entradas:
 *  - widget.js  → el que carga la tienda (objetivo: < 40 KB gzip)
 *  - preview.js → el que carga el iframe del panel
 *
 * El mapa va en un chunk aparte (import dinámico): solo se descarga si el
 * cliente pulsa "Usar mi ubicación". El bundle base no lo paga.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: { widget: 'src/index.ts', preview: 'src/preview.ts' },
      formats: ['es'],
    },
    minify: 'terser',
    terserOptions: { compress: { drop_console: true, passes: 2 } },
    rollupOptions: { output: { chunkFileNames: '[name]-[hash].js' } },
    target: 'es2019',
  },
});
