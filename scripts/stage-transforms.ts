// Stages the @rhombus-std/transforms package for publishing: copies the
// published Go tree into a staging directory and runs minformat over every
// .go file so the published source is minified (gofmt reverts it).
// go.mod, go.sum and ttsc.mjs are copied verbatim.
//
// Usage: bun scripts/stage-transforms.ts

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const TRANSFORMS = join(ROOT, 'transforms');
const STAGE_DIR = join(TRANSFORMS, 'dist', 'publish');
const TOOL_DIR = join(ROOT, 'tools', 'gominfmt');

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

const gominfmt = join(TOOL_DIR, 'gominfmt');
execSync(`go build -o ${gominfmt} .`, { cwd: TOOL_DIR, stdio: 'inherit' });

const goFiles = findGoFiles(STAGE_DIR);
for (const file of goFiles) {
  execSync(`${gominfmt} -w ${file}`, { stdio: 'inherit' });
}

console.log(`staged ${goFiles.length} .go files to ${relative(ROOT, STAGE_DIR)}`);
