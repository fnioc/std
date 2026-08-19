// Runs `bun install` once at startup, then re-runs it whenever any workspace
// package.json changes. Watches each manifest's directory rather than the file
// itself, so editors that save via rename-and-replace don't drop the watch.
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(import.meta.dir);

function install(reason: string): void {
  console.log(`[install-watch] bun install — ${reason}`);
  const result = Bun.spawnSync(['bun', 'install'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    console.error(`[install-watch] bun install exited ${result.exitCode}`);
  }
}

const manifestDirs = [root];
for (const pattern of ['libraries/*/package.json', 'examples/*/package.json', 'tests/*/package.json']) {
  for (const path of new Bun.Glob(pattern).scanSync({ cwd: root })) {
    manifestDirs.push(join(root, dirname(path)));
  }
}

install('startup');

let pending: ReturnType<typeof setTimeout> | undefined;

for (const dir of manifestDirs) {
  watch(dir, (_event, filename) => {
    if (filename !== 'package.json') {
      return;
    }
    clearTimeout(pending);
    pending = setTimeout(() => {
      install(join(dir, 'package.json'));
    }, 300);
  });
}

console.log(`[install-watch] watching ${manifestDirs.length} package.json files`);
