// Runs every workspace package's `test:e2e` script SEQUENTIALLY.
//
// `bun --filter '*' test:e2e` fans them out in parallel — fine when the ttsc
// sidecar cache is warm, but on a COLD cache each suite compiles the
// typescript-go graph from scratch (~5 min, GBs of scratch). Several cold
// compiles at once contend on CPU and blow a size-capped tmpfs, so every suite
// times out. Serial keeps at most one cold compile in flight: the first warms
// the shared Go build cache (GOCACHE), so the rest only re-link (seconds).

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GROUPS = ['libraries', 'examples', 'tests'];

const suites = [];
for (const group of GROUPS) {
  let entries;
  try {
    entries = readdirSync(join(REPO, group));
  } catch {
    continue;
  }
  for (const entry of entries) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(REPO, group, entry, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest.scripts?.['test:e2e']) {
      suites.push({ name: manifest.name, dir: join(REPO, group, entry) });
    }
  }
}
suites.sort((a, b) => a.name.localeCompare(b.name));

let failed = 0;
for (const suite of suites) {
  console.log(`\n▶ e2e: ${suite.name}`);
  const result = spawnSync('bun', ['run', 'test:e2e'], { cwd: suite.dir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`✗ ${suite.name} failed (status ${result.status})`);
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} e2e suite(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${suites.length} e2e suites passed.`);
