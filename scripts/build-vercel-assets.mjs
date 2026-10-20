import { copyFile, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Se ejecuta después de compilar el portal (vite build → public/).
   Suma el portal anterior de Caro en /professional/ y los logos que usa. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const professionalTarget = resolve(publicRoot, 'professional');
const assetsTarget = resolve(publicRoot, 'assets');

await mkdir(professionalTarget, { recursive: true });
await mkdir(assetsTarget, { recursive: true });
await cp(resolve(root, 'professional'), professionalTarget, { recursive: true, force: true });
await copyFile(resolve(root, 'kinima-icon.svg'), resolve(publicRoot, 'kinima-icon.svg'));
for (const name of ['kinima-isotipo.png', 'kinima-logo-azul.png', 'kinima-logo-crema.png']) {
  await copyFile(resolve(root, 'assets', name), resolve(assetsTarget, name));
}
console.log('Portal listo en public/ (y el portal anterior en /professional/).');
