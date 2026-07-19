// Generates transforms/go.work so the Go gates (go build/vet/test/gofmt) can run
// the transforms module against the ttsc-shipped typescript-go shim modules.
//
// go.work is gitignored (its `use`/`replace` paths are machine-specific: they
// point into the bun store where the `ttsc` package's Go module and its shim
// submodules live). ttsc generates its own throwaway go.work in a scratch dir
// during a build, but the direct gates need one in transforms/. This reproduces
// the same shape: `use` the transforms module + the ttsc module + every shim
// submodule, and `replace` the ttsc module path onto its on-disk dir (the shim
// go.mods require it by a v0.0.0 version that has no proxy).

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..');
const TRANSFORMS = join(REPO, 'transforms');

/** Find the ttsc package's Go module dir (the one holding shim/ + cmd/). */
function findTtscModuleDir() {
  // Prefer the bun isolated-linker store, then a hoisted node_modules/ttsc.
  const candidates = [];
  const bunStore = join(REPO, 'node_modules', '.bun');
  if (existsSync(bunStore)) {
    for (const entry of readdirSync(bunStore)) {
      if (entry.startsWith('ttsc@')) {
        candidates.push(join(bunStore, entry, 'node_modules', 'ttsc'));
      }
    }
  }
  candidates.push(join(REPO, 'node_modules', 'ttsc'));
  for (const dir of candidates) {
    if (existsSync(join(dir, 'go.mod')) && existsSync(join(dir, 'shim'))) {
      return dir;
    }
  }
  throw new Error('gen-go-work: could not locate the ttsc Go module (is ttsc installed?)');
}

/** Every shim submodule dir (a go.mod under shim/, recursively). */
function shimModuleDirs(ttscDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const child = join(dir, entry.name);
      if (existsSync(join(child, 'go.mod'))) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(join(ttscDir, 'shim'));
  return out.sort();
}

const ttscDir = findTtscModuleDir();
const uses = ['.', ttscDir, ...shimModuleDirs(ttscDir)];
const useBlock = uses.map((u) => `\t${u}`).join('\n');
const goWork =
  `go 1.26\n\nuse (\n${useBlock}\n)\n\nreplace github.com/samchon/ttsc/packages/ttsc v0.0.0 => ${ttscDir}\n`;

writeFileSync(join(TRANSFORMS, 'go.work'), goWork);
console.log(`gen-go-work: wrote transforms/go.work (${uses.length} modules, ttsc at ${dirname(ttscDir)})`);
