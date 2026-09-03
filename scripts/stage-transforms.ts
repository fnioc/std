// Stages the @rhombus-std/transforms package for publishing: copies the
// published Go tree into a staging directory and runs the mise-pinned minformat
// over every .go file so the published source is minified (gofmt reverts it).
// go.mod, go.sum and ttsc.mjs are copied verbatim.
//
// Usage: bun scripts/stage-transforms.ts

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const TRANSFORMS = join(ROOT, 'transforms');
const STAGE_DIR = join(TRANSFORMS, 'dist', 'publish');

const PUBLISHED_DIRS = ['cmd', 'internal'];
const PUBLISHED_FILES = ['go.mod', 'go.sum', 'ttsc.mjs'];

function findGoFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findGoFiles(full));
    } else if (extname(entry.name) === '.go' && !entry.name.endsWith('_test.go')) {
      files.push(full);
    }
  }
  return files;
}

rmSync(STAGE_DIR, { recursive: true, force: true });
mkdirSync(STAGE_DIR, { recursive: true });

for (const dir of PUBLISHED_DIRS) {
  cpSync(join(TRANSFORMS, dir), join(STAGE_DIR, dir), {
    recursive: true,
    filter: (src) => !src.endsWith('_test.go'),
  });
}
for (const file of PUBLISHED_FILES) {
  cpSync(join(TRANSFORMS, file), join(STAGE_DIR, file));
}

const pkg = JSON.parse(readFileSync(join(TRANSFORMS, 'package.json'), 'utf8'));
if (pkg.publishConfig) {
  delete pkg.publishConfig.directory;
}
writeFileSync(join(STAGE_DIR, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// The minifier is resolved through mise so the version pinned in mise.toml is
// the one that runs. `cmd` is the binary's name: the CLI lives at the end of the
// module path `github.com/go-toolsmith/minformat/cmd`.
const minformat = execSync('mise which cmd', { cwd: ROOT, encoding: 'utf8' }).trim();

const goFiles = findGoFiles(STAGE_DIR);
for (const file of goFiles) {
  // The CLI writes to stdout and takes one file per run.
  writeFileSync(file, execSync(`${minformat} ${file}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

console.log(`staged ${goFiles.length} .go files to ${relative(ROOT, STAGE_DIR)}`);
