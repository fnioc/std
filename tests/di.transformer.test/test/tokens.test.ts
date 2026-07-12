import { describe, expect, test } from 'bun:test';
import { transform, type VirtualFiles } from './harness.js';

// Token generation (PRD §8). Every token is `<source>:<exportName>`, exercised
// through the lowered output:
//   - package-public type  →  `importSpecifier:Symbol`  (version excluded)
//   - app-internal type    →  `packageName/path:Symbol`
//   - rootless type        →  `./path:Symbol`
//   - `Promise<X>`         →  the honest closed-generic token `Promise<X>`
//
// Signatures ride inline on the registration: `add("token", Ctor, [[...]])`.

// A library installed under node_modules with an `exports` subpath map.
function withLib(appSource: string): VirtualFiles {
  return {
    '/proj/node_modules/your-lib/package.json': JSON.stringify({
      name: 'your-lib',
      version: '3.4.5',
      exports: {
        '.': './index.js',
        './contracts': './contracts/index.js',
      },
    }),
    '/proj/node_modules/your-lib/index.d.ts': `
      export interface IRoot {}
    `,
    '/proj/node_modules/your-lib/contracts/index.d.ts': `
      export interface IFoo {}
      export interface IBar {}
    `,
    '/proj/src/app.ts': appSource,
  };
}

describe('token generation', () => {
  test('package-public type → importSpecifier:Symbol', () => {
    const files = withLib(`
      import { IFoo } from "your-lib/contracts";
      class Foo implements IFoo { constructor() {} }
      declare const services: any;
      services.add<IFoo>(Foo).as<"singleton">();
    `);
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('services.add("your-lib/contracts:IFoo", Foo, ');
  });

  test('package-public root export → packageName:Symbol (no subpath)', () => {
    const files = withLib(`
      import { IRoot } from "your-lib";
      class RootImpl implements IRoot { constructor() {} }
      declare const services: any;
      services.add<IRoot>(RootImpl).as<"singleton">();
    `);
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('services.add("your-lib:IRoot", RootImpl, ');
  });

  test('token excludes the package version', () => {
    const files = withLib(`
      import { IFoo } from "your-lib/contracts";
      class Foo implements IFoo { constructor() {} }
      declare const services: any;
      services.add<IFoo>(Foo).as<"singleton">();
    `);
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).not.toContain('3.4.5');
    expect(out).toContain('your-lib/contracts:IFoo');
  });

  test('app-internal (non-exported) type → packageName/path:Symbol token', () => {
    // No package.json provides this interface's file as a public export, and the
    // interface lives in the app's own src tree → a `./...` token.
    const files: VirtualFiles = {
      '/proj/package.json': JSON.stringify({ name: 'the-app', version: '1.0.0' }),
      '/proj/src/services/IUserRepo.ts': `export interface IUserRepo {}`,
      '/proj/src/app.ts': `
        import { IUserRepo } from "./services/IUserRepo";
        class SqlUserRepo implements IUserRepo { constructor() {} }
        declare const services: any;
        services.add<IUserRepo>(SqlUserRepo).as<"request">();
      `,
    };
    const { outputs } = transform(files, {
      entry: ['/proj/src/app.ts'],
      compilerOptions: { rootDir: '/proj' },
    });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain(
      'services.add("the-app/src/services/IUserRepo:IUserRepo", SqlUserRepo, ',
    );
  });

  test('app-internal token: a second packageName/path:Symbol witness', () => {
    // No basename-dedup any more — the token is uniformly `packageName/path:Symbol`
    // even when the file basename differs from the declared symbol.
    const files: VirtualFiles = {
      '/proj/package.json': JSON.stringify({ name: 'the-app', version: '1.0.0' }),
      '/proj/src/contracts.ts': `export interface IThing {}`,
      '/proj/src/app.ts': `
        import { IThing } from "./contracts";
        class Thing implements IThing { constructor() {} }
        declare const services: any;
        services.add<IThing>(Thing).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, {
      entry: ['/proj/src/app.ts'],
      compilerOptions: { rootDir: '/proj' },
    });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('services.add("the-app/src/contracts:IThing", Thing, ');
  });

  test('Promise<X> parameter → the honest closed-generic token Promise<X>', () => {
    const files = withLib(`
      import { IFoo } from "your-lib/contracts";
      class Foo implements IFoo {}
      class NeedsAsync {
        constructor(foo: Promise<IFoo>) {}
      }
      class Marker {}
      declare const services: any;
      services.add<IFoo>(Foo).as<"singleton">();
      services.add<Marker>(NeedsAsync).as<"singleton">();
    `);
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    // Honest token-split: Promise<IFoo> derives the closed-generic token
    // `Promise<...IFoo>` (Promise-ness is part of the identity), NOT stripped.
    expect(out).toContain(
      'NeedsAsync, [["Promise<your-lib/contracts:IFoo>"]]',
    );
  });

  test('re-export from root: a deep declaration tokenizes as the BARE package', () => {
    // `Deep` is declared in an internal file that is NOT itself an export entry,
    // but the root `index` re-exports it. Derivation is export-GRAPH based, so
    // the token is the bare package `your-lib:Deep` — stem matching (which sees
    // only the nested declaration file) could never produce this.
    const files: VirtualFiles = {
      '/proj/node_modules/your-lib/package.json': JSON.stringify({
        name: 'your-lib',
        version: '1.0.0',
        exports: { '.': './index.js' },
      }),
      '/proj/node_modules/your-lib/index.d.ts': `export { Deep } from "./internal/deep";`,
      '/proj/node_modules/your-lib/internal/deep.d.ts': `export interface Deep {}`,
      '/proj/src/app.ts': `
        import { Deep } from "your-lib";
        class DeepImpl implements Deep { constructor() {} }
        declare const services: any;
        services.add<Deep>(DeepImpl).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('services.add("your-lib:Deep", DeepImpl, ');
  });

  // ── self-compilation of a DIST-REFERENCED package ───────────────────────────
  //
  // When a package's `exports` conditions point at `dist` (the repo's src-refs
  // retirement) and the package COMPILES ITSELF, its own dist is not built yet,
  // so no export target's on-disk stem is in the program. The token must STILL
  // derive the Tier-1 barrel `pkg:Type` (byte-identical to what a consumer of the
  // built dist derives) — resolved from the loaded SOURCE entry (`src/index.ts`,
  // per scripts/build-lib.ts's `dist/<X>.js ↔ src/<X>.ts` convention), never the
  // build-state-dependent Tier-2 file-path fallback. These fixtures model that:
  // a dist-only `exports` map with ONLY the package's `src/*.ts` present.

  // A dist-referenced package that owns `app.ts`; `src/index.ts` is the source
  // entry TypeScript loads (mirroring tsconfig `include: ["src"]`), no `dist/*`.
  function selfCompileDistLib(
    indexSource: string,
    extra: VirtualFiles = {},
  ): VirtualFiles {
    return {
      '/proj/package.json': JSON.stringify({
        name: 'my-lib',
        version: '1.0.0',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            bun: './dist/index.js',
            types: './dist/index.d.ts',
            import: './dist/index.js',
            default: './dist/index.js',
          },
        },
      }),
      '/proj/src/index.ts': indexSource,
      ...extra,
    };
  }

  // Program roots include the source entry so it is loaded, exactly as the
  // package's own tsconfig `include` would — only `app.ts` is asserted on.
  const selfCompileEntry = ['/proj/src/index.ts', '/proj/src/app.ts'];

  test('self-compile, dist-referenced, root-re-exported type → BARE package barrel', () => {
    const files = selfCompileDistLib(`export * from "./foo";`, {
      '/proj/src/foo.ts': `export interface IFoo {}`,
      '/proj/src/app.ts': `
        import { IFoo } from "./foo";
        class Foo implements IFoo { constructor() {} }
        declare const services: any;
        services.add<IFoo>(Foo).as<"singleton">();
      `,
    });
    const { outputs } = transform(files, { entry: selfCompileEntry });
    const out = outputs['/proj/src/app.ts']!;
    // Barrel `my-lib:IFoo`, NOT the Tier-2 `my-lib/src/foo:IFoo` — the token is
    // build-state-independent.
    expect(out).toContain('services.add("my-lib:IFoo", Foo, ');
  });

  test('consumer of the built dist derives the SAME barrel token', () => {
    // The identity-critical pairing: a consumer resolving the built dist d.ts
    // must derive the exact string the self-compile above did.
    const files: VirtualFiles = {
      '/proj/node_modules/my-lib/package.json': JSON.stringify({
        name: 'my-lib',
        version: '1.0.0',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
        },
      }),
      '/proj/node_modules/my-lib/dist/index.d.ts': `export interface IFoo {}`,
      '/proj/src/app.ts': `
        import { IFoo } from "my-lib";
        class Foo implements IFoo { constructor() {} }
        declare const services: any;
        services.add<IFoo>(Foo).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    expect(outputs['/proj/src/app.ts']!).toContain('services.add("my-lib:IFoo", Foo, ');
  });

  test('self-compile, dist-referenced, NON-exported internal type → Tier-2 file path', () => {
    // The source entry is now discoverable, but membership still gates promotion:
    // an internal type not re-exported from `src/index.ts` keeps the file-path
    // token. Proves the fix only fixes ENTRY DISCOVERY, not membership.
    const files = selfCompileDistLib(`export {};`, {
      '/proj/src/internal.ts': `export interface IHidden {}`,
      '/proj/src/app.ts': `
        import { IHidden } from "./internal";
        class Hidden implements IHidden { constructor() {} }
        declare const services: any;
        services.add<IHidden>(Hidden).as<"singleton">();
      `,
    });
    const { outputs } = transform(files, {
      entry: selfCompileEntry,
      compilerOptions: { rootDir: '/proj' },
    });
    expect(outputs['/proj/src/app.ts']!).toContain(
      'services.add("my-lib/src/internal:IHidden", Hidden, ',
    );
  });

  test('self-compile, dist-referenced, aliased re-export → DECLARED name barrel', () => {
    // `export { IFoo as IRenamed }` — the token carries the DECLARED name `IFoo`,
    // because a consumer writing `add<IRenamed>()` sees the same declaration
    // symbol (export renames are transparent to the type). Both sides agree.
    const files = selfCompileDistLib(`export { IFoo as IRenamed } from "./foo";`, {
      '/proj/src/foo.ts': `export interface IFoo {}`,
      '/proj/src/app.ts': `
        import { IRenamed } from "./index";
        class Foo implements IRenamed { constructor() {} }
        declare const services: any;
        services.add<IRenamed>(Foo).as<"singleton">();
      `,
    });
    const { outputs } = transform(files, { entry: selfCompileEntry });
    expect(outputs['/proj/src/app.ts']!).toContain('services.add("my-lib:IFoo", Foo, ');
  });

  test('self-compile, dist-referenced, type exported from MANY subpaths → root barrel wins', () => {
    // A type re-exported from BOTH the root and a subpath entry tokenizes as the
    // shortest (root) specifier — the deterministic winner the sort implies.
    const files: VirtualFiles = {
      '/proj/package.json': JSON.stringify({
        name: 'my-lib',
        version: '1.0.0',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
          './extras': {
            types: './dist/extras.d.ts',
            import: './dist/extras.js',
            default: './dist/extras.js',
          },
        },
      }),
      '/proj/src/foo.ts': `export interface IFoo {}`,
      '/proj/src/index.ts': `export * from "./foo";`,
      '/proj/src/extras.ts': `export * from "./foo";`,
      '/proj/src/app.ts': `
        import { IFoo } from "./foo";
        class Foo implements IFoo { constructor() {} }
        declare const services: any;
        services.add<IFoo>(Foo).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, {
      entry: ['/proj/src/index.ts', '/proj/src/extras.ts', '/proj/src/app.ts'],
    });
    expect(outputs['/proj/src/app.ts']!).toContain('services.add("my-lib:IFoo", Foo, ');
  });

  test('self-compile, dist-referenced, subpath-only export → subpath barrel', () => {
    // Exported ONLY from a subpath entry (`./extras`) → the subpath specifier
    // `my-lib/extras:IFoo`, resolved from `src/extras.ts` via the dist→src twin.
    const files: VirtualFiles = {
      '/proj/package.json': JSON.stringify({
        name: 'my-lib',
        version: '1.0.0',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
          './extras': {
            types: './dist/extras.d.ts',
            import: './dist/extras.js',
            default: './dist/extras.js',
          },
        },
      }),
      '/proj/src/foo.ts': `export interface IFoo {}`,
      '/proj/src/index.ts': `export {};`,
      '/proj/src/extras.ts': `export * from "./foo";`,
      '/proj/src/app.ts': `
        import { IFoo } from "./foo";
        class Foo implements IFoo { constructor() {} }
        declare const services: any;
        services.add<IFoo>(Foo).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, {
      entry: ['/proj/src/index.ts', '/proj/src/extras.ts', '/proj/src/app.ts'],
    });
    expect(outputs['/proj/src/app.ts']!).toContain('services.add("my-lib/extras:IFoo", Foo, ');
  });

  test('nested namespace type → module-qualified export name A.Foo', () => {
    const files: VirtualFiles = {
      '/proj/node_modules/your-lib/package.json': JSON.stringify({
        name: 'your-lib',
        version: '1.0.0',
        exports: { '.': './index.js' },
      }),
      '/proj/node_modules/your-lib/index.d.ts': `
        export namespace A {
          export interface Foo {}
        }
      `,
      '/proj/src/app.ts': `
        import { A } from "your-lib";
        class FooImpl implements A.Foo { constructor() {} }
        declare const services: any;
        services.add<A.Foo>(FooImpl).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('services.add("your-lib:A.Foo", FooImpl, ');
  });
});
