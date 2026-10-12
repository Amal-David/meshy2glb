import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), out = resolve(root, 'dist-extension');
await mkdir(out, { recursive: true });
for (const file of ['manifest.json','popup.html','popup.css','popup.js']) await copyFile(resolve(root,'extension',file),resolve(out,file));
await copyFile(resolve(root,'src/glb.js'),resolve(out,'glb.js'));
let bundle = '(() => {\n"use strict";\n';
for (const file of ['src/discovery.js','src/snapshot.js','extension/page.js']) {
  const source = await readFile(resolve(root,file),'utf8');
  if (/^import\s/m.test(source)) throw new Error(`Unexpected dependency in ${file}`);
  bundle += source.replace(/^export /gm,'') + '\n';
}
bundle += '})();\n'; await writeFile(resolve(out,'page-bundle.js'),bundle);
console.log('Built dist-extension: activeTab + scripting only; load unpacked in Chrome.');
