import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const adminRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(adminRoot, '../..');
const source = resolve(repositoryRoot, 'apps/widget/dist');

// 1) Panel: la vista previa (iframe /preview) carga /widget/preview.js.
// 2) Extensión del tema: la tienda carga widget.js desde los assets de la extensión.
//    Se borran los chunks viejos con hash para que no se acumulen versiones.
const destinations = [
  resolve(adminRoot, 'public/widget'),
  resolve(adminRoot, 'extensions/cod-form/assets'),
];

const built = new Set(await readdir(source));
for (const destination of destinations) {
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(destination)) {
    if (file.endsWith('.js') && !built.has(file)) await rm(resolve(destination, file));
  }
  await cp(source, destination, { recursive: true, force: true });
}

console.log('Widget assets copied to the admin public directory and the theme extension.');
