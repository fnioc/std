import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import { describe, expect, test } from 'bun:test';
import { fixture, transform, type VirtualFiles } from './harness.js';

// `nameof<T>()` rewriting (PRD §8): a `nameof<IFoo>()` call in source is
// replaced by its string token at compile time.

describe('nameof<T>() runtime body (transformer absent)', () => {
  test('throws a tight, instructive message naming the plugin + how to add it', () => {
    // The runtime body only runs when the transformer did not rewrite the call.
    expect(() => nameof<unknown>()).toThrow(
      'nameof<T>() requires the @rhombus-std/di.transformer plugin. Add { "transform": '
        + '"@rhombus-std/di.transformer" } to your tsconfig "plugins", or pass a token string.',
    );
    let message = '';
    try {
      nameof<unknown>();
    } catch (e) {
      message = (e as Error).message;
    }
    // Instructive, short, and free of "lowering" jargon.
    expect(message).toContain('@rhombus-std/di.transformer plugin');
    expect(message).toContain('plugins');
    expect(message.toLowerCase()).not.toContain('lower');
    expect(message.split('\n').length).toBe(1);
  });
});

describe('nameof<T>() rewriting', () => {
  test('rewrites nameof<IFoo>() to the app-internal token', () => {
    const src = `
      import { nameof } from "@rhombus-std/di.transformer";
      interface IFoo {}
      const key = nameof<IFoo>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('const key = "./app:IFoo"');
    expect(output).not.toContain('nameof<');
  });

  test('rewrites nameof<T>() to a package-public token', () => {
    const files: VirtualFiles = {
      '/proj/node_modules/your-lib/package.json': JSON.stringify({
        name: 'your-lib',
        version: '2.0.0',
        exports: { './contracts': './contracts/index.js' },
      }),
      '/proj/node_modules/your-lib/contracts/index.d.ts': `export interface IFoo {}`,
      '/proj/src/app.ts': `
        import { nameof } from "@rhombus-std/di.transformer";
        import { IFoo } from "your-lib/contracts";
        const key = nameof<IFoo>();
      `,
    };
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(out).toContain('const key = "your-lib/contracts:IFoo"');
  });

  test("rewrites nameof regardless of how it's imported/aliased", () => {
    // A virtual `@rhombus-std/di.transformer` module that genuinely declares `nameof`,
    // so symbol resolution sees the real `nameof` name behind the local alias.
    const files: VirtualFiles = {
      '/proj/node_modules/@rhombus-std/di.transformer/package.json': JSON.stringify({
        name: '@rhombus-std/di.transformer',
        version: '0.0.0',
        exports: { '.': './index.js' },
      }),
      '/proj/node_modules/@rhombus-std/di.transformer/index.d.ts': `export declare function nameof<T>(): string;`,
      '/proj/src/app.ts': `
        import { nameof as keyOf } from "@rhombus-std/di.transformer";
        interface IBar {}
        const k = keyOf<IBar>();
      `,
    };
    const { outputs } = transform(files, {
      entry: ['/proj/src/app.ts'],
      compilerOptions: { rootDir: '/proj' },
    });
    const out = outputs['/proj/src/app.ts']!;
    // The aliased call uses the local name; the rewrite keys on the resolved
    // symbol's real name (`nameof`), so it still lowers to the token.
    expect(out).toContain('const k = "./src/app:IBar"');
  });
});

describe('nameof<T>() defaulted-generic alias normalization (§40)', () => {
  // A defaulted generic alias referenced BARE is indistinguishable from the
  // bare alias — the checker records the pre-applied default argument for a
  // same-file reference but omits it for an imported one, yet both spell the
  // identical type. When every recorded argument equals its parameter's
  // declared default, the token drops the args: the augmentation-token shape
  // (`nameof<ServiceManifest>()` on `type ServiceManifest<S extends string =
  // "singleton"> = …`). An explicit non-default argument keeps the args.

  test('bare reference to a defaulted-generic alias drops the default → bare token', () => {
    const src = `
      import { nameof } from "@rhombus-std/di.transformer";
      interface ManifestBase<S extends string> {}
      type Manifest<S extends string = "singleton"> = ManifestBase<S>;
      const key = nameof<Manifest>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('const key = "./app:Manifest"');
    expect(output).not.toContain('./app:Manifest<');
  });

  test('explicit non-default argument keeps the closed-generic token', () => {
    const src = `
      import { nameof } from "@rhombus-std/di.transformer";
      interface ManifestBase<S extends string> {}
      type Manifest<S extends string = "singleton"> = ManifestBase<S>;
      const key = nameof<Manifest<"request">>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('./app:Manifest<');
    expect(output).toContain('request');
  });
});
