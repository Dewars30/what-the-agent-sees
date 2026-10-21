// Copy shared core into each app so every app deploys as a self-contained folder.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const apps = fs.readdirSync(path.join(root, 'apps'));
for (const app of apps) {
  const dir = path.join(root, 'apps', app);
  if (!fs.statSync(dir).isDirectory()) continue;
  const target = path.join(dir, 'core');
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'core'))) {
    if (f.endsWith('.mjs')) fs.copyFileSync(path.join(root, 'core', f), path.join(target, f));
  }
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({
      name: app,
      private: true,
      type: 'module',
      scripts: { start: 'node server.mjs' },
      engines: { node: '>=20' },
    }, null, 2) + '\n');
  }
  console.log('synced', app);
}
