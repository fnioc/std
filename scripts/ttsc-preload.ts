// Runtime counterpart of the ttsc/Go lowering stage `scripts/build-package.ts`
// runs at build time: in-repo resolution is source-first, so a workspace import
// lands directly on a library's `src/`, and many libraries call `typefor<T>()`
// (and friends) there -- primitives whose real bodies exist only after ttsc
// rewrites them. Left un-lowered, the first such call throws at import time.
//
// A ttsc plugin instance is bound to ONE project and throws on any file
// outside that project's root, so one instance can't cover the whole
// workspace -- and its own onLoad filter matches every `.ts` file with no
// path scoping, so several instances can't coexist as separate
// `Bun.plugin()` registrations either. Instead this registers exactly ONE
// plugin and dispatches internally: the absolute path of the file being
// loaded decides which package owns it (by `<pkg>/src/` prefix), and that
// package's own ttsc plugin instance -- built lazily, on the first file
// actually touched from it, and reused after that -- lowers it. Each file is
// lowered through the same project the build uses, so what runs matches the
// built stage emit exactly. A file outside every lowering package's `src/`
// passes through unchanged.
//
// Load this once per process via bunfig.toml: `preload` for `bun run`,
// `[test] preload` for `bun test` (a separate key it reads instead of the
// top-level one). scripts/derive-preload-bunfig.ts writes both into every
// workspace package.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { readTsconfigTransforms, ttscBunPlugin, ttscEnv } from './build-package';

const ROOT = join(import.meta.dir, '..');
const TTSC_PROJECT = 'tsconfig.ttsc.json';
// The workspace groups that can hold lowering packages (a `tsconfig.ttsc.json`
// IS the opt-in, so a new lowering package needs no change here).
const GROUPS = ['libraries', 'examples'];

// The ttsc bun adapter's own onLoad filter (`@ttsc/unplugin`'s
// `sourceFilePattern`) -- every `.ts`/`.cts`/`.mts`/`.tsx` file, so this
// dispatcher sees exactly the files a per-package plugin would have claimed
// on its own.
const TS_FILE_PATTERN = /\.[cm]?tsx?$/;

// Under hoisted typefor emission the engine collects every derived `Type` into
// one generated const module it writes into the project's outDir, and each
// lowered call site references it by a relative specifier. Two load-time facts
// follow. The OUT DIR MUST SIT OUTSIDE THE PACKAGE: the adapter validates its
// per-project result cache by hashing every file under the package dir, so an
// in-package emit would invalidate the cache it itself belongs to and force a
// whole-project recompile per loaded file. A fresh per-process temp dir keeps
// the emit out of the hash walk and cannot collide with a concurrent test
// process writing the same module. And the RELATIVE SPECIFIER DANGLES: the
// importer executes from `src/`, so the reference is remapped onto the owning
// package's out dir by the onResolve hook below. The module is on disk before
// any lowered file is returned -- the engine writes it before it emits its
// result envelope -- so the remapped path always exists by the time it is
// imported.
const TYPEFOR_MODULE = '__typefor__.js';
const TYPEFOR_NAMESPACE = 'rhombus-typefor';
const EMIT_ROOT = mkdtempSync(join(tmpdir(), 'rhombus-ttsc-preload-'));

interface LoweringPackage {
  readonly dir: string;
  /** `dir`'s `src/`, with a trailing separator so e.g. `di.core` can't prefix-match a hypothetical `di.core-extra`. */
  readonly srcPrefix: string;
  /** The per-process directory this package's generated modules are emitted into. */
  readonly emitDir: string;
}

function discoverLoweringPackages(): readonly LoweringPackage[] {
  const packages: LoweringPackage[] = [];
  for (const group of GROUPS) {
    for (const match of new Bun.Glob(`*/${TTSC_PROJECT}`).scanSync({ cwd: join(ROOT, group) })) {
      const dir = dirname(join(ROOT, group, match));
      packages.push({ dir, srcPrefix: join(dir, 'src') + sep, emitDir: join(EMIT_ROOT, group, basename(dir)) });
    }
  }
  return packages;
}

function ownerOf(path: string, packages: readonly LoweringPackage[]): LoweringPackage | undefined {
  return packages.find((pkg) => path.startsWith(pkg.srcPrefix));
}

/** A file outside every lowering package's `src/` -- read as-is; the explicit loader keeps Bun transpiling it normally. */
async function passthrough(path: string): Promise<{ contents: string; loader: 'ts' | 'tsx'; }> {
  return { contents: await Bun.file(path).text(), loader: /x$/i.test(path) ? 'tsx' : 'ts' };
}

/**
 * The minimal `Bun.PluginBuilder` this module fakes to capture a ttsc
 * plugin's onLoad callback instead of letting it call the real
 * `Bun.plugin()` -- a second broad-filter registration would only shadow the
 * dispatcher `install()` installs below, and a plugin instance still only
 * knows how to lower the one project it was built for. The adapter's
 * `setup()` calls only `build.onLoad()`, once, synchronously (verified
 * against `@ttsc/unplugin/lib/bun.js`), so nothing else needs faking.
 */
interface CaptureBuild {
  onLoad(constraints: Bun.PluginConstraints, callback: Bun.OnLoadCallback): void;
}

async function buildLoader(pkg: LoweringPackage): Promise<Bun.OnLoadCallback> {
  const manualTransforms = readTsconfigTransforms(pkg.dir, TTSC_PROJECT);
  const plugin = await ttscBunPlugin(pkg.dir, TTSC_PROJECT,
    manualTransforms.length > 0 ? manualTransforms : undefined, { outDir: pkg.emitDir });
  let captured: Bun.OnLoadCallback | undefined;
  const capture: CaptureBuild = {
    onLoad(_constraints, callback) {
      captured = callback;
    },
  };
  await plugin.setup(capture as unknown as Bun.PluginBuilder);
  if (!captured) {
    throw new Error(`ttsc-preload: ${pkg.dir} registered no onLoad handler`);
  }
  return captured;
}

// One memoized loader per package, keyed by its directory. The stored value
// is the in-flight PROMISE, not its resolved result: several files from the
// same package can be requested before the first one resolves, and storing
// the promise immediately -- before awaiting it -- means they all share that
// one construction instead of each triggering their own whole-project
// compile.
const loaders = new Map<string, Promise<Bun.OnLoadCallback>>();

function loaderFor(pkg: LoweringPackage): Promise<Bun.OnLoadCallback> {
  let pending = loaders.get(pkg.dir);
  if (!pending) {
    pending = buildLoader(pkg);
    loaders.set(pkg.dir, pending);
  }
  return pending;
}

function install(): void {
  Object.assign(process.env, ttscEnv());
  const packages = discoverLoweringPackages();
  Bun.plugin({
    name: 'rhombus-ttsc-dispatch',
    setup(build) {
      // The generated module rides a VIRTUAL module (`build.module`), never a
      // plain file path: bun can begin resolving a lowered file's imports
      // before the owning package's whole-project compile has flushed the
      // module to disk, and a direct path read races that write. The virtual
      // module's callback awaits the compile (loaderFor triggers it if nothing
      // else has), by which point the engine has written the module.
      for (const pkg of packages) {
        build.module(`${TYPEFOR_NAMESPACE}:${pkg.dir}`, async () => {
          await loaderFor(pkg);
          return { contents: await Bun.file(join(pkg.emitDir, TYPEFOR_MODULE)).text(), loader: 'js' };
        });
      }
      build.onResolve({ filter: /__typefor__\.js$/ }, (args) => {
        const pkg = ownerOf(args.importer, packages);
        if (!pkg) {
          return undefined;
        }
        return { path: `${TYPEFOR_NAMESPACE}:${pkg.dir}` };
      });
      build.onLoad({ filter: TS_FILE_PATTERN }, async (args) => {
        const pkg = ownerOf(args.path, packages);
        if (!pkg) {
          return passthrough(args.path);
        }
        const loader = await loaderFor(pkg);
        return loader(args);
      });
    },
  });
}

install();
