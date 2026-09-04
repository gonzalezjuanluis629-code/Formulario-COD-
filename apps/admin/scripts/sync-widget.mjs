import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const adminRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(adminRoot, '../..');
const source = resolve(repositoryRoot, 'apps/widget/dist');
const destination = resolve(adminRoot, 'public/widget');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

console.log('Widget assets copied to the admin public directory.');
