import { describe, expect, test } from 'bun:test';
import { CORE_BRAND_APP, depsArrayFor, fixture, transform, withCoreBrand } from './harness.js';

// Brands declared inline (structural detection, no import needed): the `Keyed`
// key brand plus the open-generic `Hole` brand, so a keyed base can itself carry
// a hole.
const KEYED_HOLE_BRANDS = `
  declare const KEY: unique symbol;
  type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
  declare const HOLE: unique symbol;
  type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
  type $<N extends number> = Hole<N>;
`;

// Keyed-services transformer lowering.
//
// A key is not a parallel resolution subsystem — it is a `#<key>` suffix on the
// ordinary token the underlying `T` derives. The transformer lowers the
// `Keyed<T, K>` brand (a phantom `T & { readonly [KEY]?: K }` intersection) to
// the PRE-COMPOSED single-arg token `<base>#<K>`:
//
//   - a ctor/factory param typed `Keyed<T, "k">` lowers its dep to `<base>#k`;
//   - `add<Keyed<T, "k">>(Impl)` registers under `<base>#k`;
//   - `Keyed` stacks orthogonally with `Inject`: `Keyed<Inject<T, "tok">, "k">`
//     reads `[TOK]` for the base and `[KEY]` for the suffix → `tok#k`.
//
// The base is derived by the SAME machinery a non-keyed token uses, so a keyed
// token is exactly its non-keyed sibling plus the `#k` suffix — which is why the
// structural tests below assert against the base a plain param/registration
// derives in the very same fixture rather than hard-coding a path token.

/** Pull the sole token out of a single-param signature array `[["<token>"]]`. */
function soleToken(depsArray: string): string {
  const match = /^\[\["([^"]+)"\]\]$/.exec(depsArray);
  if (!match) {
    throw new Error(`not a single-token signature: ${depsArray}`);
  }
  return match[1]!;
}

/** Pull the registration token out of `services.add("<token>", <ctor>, ...)`. */
function regToken(output: string, ctor: string): string {
  const match = new RegExp(`services\\.add\\("([^"]+)", ${ctor},`).exec(output);
  if (!match) {
    throw new Error(`no registration token for ${ctor} in:\n${output}`);
  }
  return match[1]!;
}

describe('Keyed<T, K> injection lowering', () => {
  test('Keyed<T, "k"> ctor param lowers to <base>#k (structural base)', () => {
    // The keyed param derives ICache's base exactly as the plain param does,
    // then appends `#redis`. Deriving the expected base from the plain sibling
    // keeps the assertion independent of ICache's path-derived token.
    const files = withCoreBrand(`
        import type { Keyed } from "@rhombus-std/di.core";
        interface ICache {}
        interface IPlain {}
        interface IKeyed {}
        class Plain implements IPlain {
          constructor(cache: ICache) {}
        }
        class Handler implements IKeyed {
          constructor(cache: Keyed<ICache, "redis">) {}
        }
        services.add<IPlain>(Plain).as<"singleton">();
        services.add<IKeyed>(Handler).as<"singleton">();
      `);
    const { outputs, diagnostics } = transform(files, { entry: [CORE_BRAND_APP] });
    const out = outputs[CORE_BRAND_APP]!;
    expect(diagnostics.length).toBe(0);

    const base = soleToken(depsArrayFor(out, 'Plain'));
    expect(depsArrayFor(out, 'Handler')).toBe(`[["${base}#redis"]]`);
  });

  test('Keyed<Inject<T, "tok">, "k"> composes the pinned base with the key (tok#k)', () => {
    // Both brands stack: `[TOK]` fixes the base token, `[KEY]` appends the
    // suffix. The base is the pinned "pkg:redis-cache", never a structurally
    // derived ICache token.
    const files = withCoreBrand(`
        import type { Inject, Keyed } from "@rhombus-std/di.core";
        interface ICache {}
        interface ISvc {}
        class Svc implements ISvc {
          constructor(cache: Keyed<Inject<ICache, "pkg:redis-cache">, "primary">) {}
        }
        services.add<ISvc>(Svc).as<"singleton">();
      `);
    const { outputs, diagnostics } = transform(files, { entry: [CORE_BRAND_APP] });
    const out = outputs[CORE_BRAND_APP]!;
    expect(diagnostics.length).toBe(0);

    const arr = depsArrayFor(out, 'Svc');
    expect(arr).toBe('[["pkg:redis-cache#primary"]]');
    // The structural ICache token was NOT used — only the pinned base + key.
    expect(arr).not.toContain('ICache');
  });

  test('Keyed brand on a symbol-less anonymous base still composes (via Inject)', () => {
    // A `Keyed<Inject<{ ... }, "tok">, "k">` brands an anonymous structural base
    // with an explicit token and keys it — no hard error, exact `tok#k`.
    const files = withCoreBrand(`
        import type { Inject, Keyed } from "@rhombus-std/di.core";
        interface ISvc {}
        class Svc implements ISvc {
          constructor(opts: Keyed<Inject<{ n: number }, "my:opts">, "alt">) {}
        }
        services.add<ISvc>(Svc).as<"singleton">();
      `);
    const { outputs, diagnostics } = transform(files, { entry: [CORE_BRAND_APP] });
    const out = outputs[CORE_BRAND_APP]!;
    expect(diagnostics.length).toBe(0);
    expect(depsArrayFor(out, 'Svc')).toBe('[["my:opts#alt"]]');
  });
});

describe('add<Keyed<T, K>> registration lowering', () => {
  test('add<Keyed<T, "k">>(Impl) registers under <base>#k (structural base)', () => {
    // The registration token is the plain sibling's token plus `#primary`.
    const files = withCoreBrand(`
        import type { Keyed } from "@rhombus-std/di.core";
        interface IThing {}
        class PlainThing implements IThing {}
        class KeyedThing implements IThing {}
        services.add<IThing>(PlainThing).as<"singleton">();
        services.add<Keyed<IThing, "primary">>(KeyedThing).as<"singleton">();
      `);
    const { outputs, diagnostics } = transform(files, { entry: [CORE_BRAND_APP] });
    const out = outputs[CORE_BRAND_APP]!;
    expect(diagnostics.length).toBe(0);

    const base = regToken(out, 'PlainThing');
    expect(out).toContain(`services.add("${base}#primary", KeyedThing,`);
    // The keyed registration is a DISTINCT token from the bare base — a keyed
    // registration never collides with, nor leaks into, the non-keyed token.
    expect(base).not.toContain('#');
    expect(regToken(out, 'KeyedThing')).toBe(`${base}#primary`);
  });

  test('keyed base carrying an open-generic hole composes <base<$N>>#k', () => {
    // The exotic case the parity fix guards: a generic impl registered OPEN, whose
    // ctor param keys an open-generic base (`Keyed<IThing<T>, "redis">`). After the
    // instantiation substitutes T→Hole<1>, the keyed base must render its hole as
    // `$1` — so the composed dep token is `./app:IThing<$1>#redis`, NOT a dropped
    // key / hard diagnostic. Both engines must emit this byte-for-byte.
    const src = `
        ${KEYED_HOLE_BRANDS}
        interface IThing<T> {}
        interface IRepo<T> {}
        class SqlRepo<T> implements IRepo<T> {
          constructor(cache: Keyed<IThing<T>, "redis">) {}
        }
        services.add<IRepo<$<1>>>(SqlRepo<$<1>>).as<"singleton">();
      `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics.length).toBe(0);
    expect(output).toContain(
      'services.add("./app:IRepo<$1>", SqlRepo, [["./app:IThing<$1>#redis"]]).as("singleton");',
    );
  });

  test('add<Keyed<Inject<T, "tok">, "k">>(Impl) registers under tok#k (exact)', () => {
    const files = withCoreBrand(`
        import type { Inject, Keyed } from "@rhombus-std/di.core";
        interface IThing {}
        class KeyedThing implements IThing {}
        services.add<Keyed<Inject<IThing, "pkg:IThing">, "primary">>(KeyedThing).as<"singleton">();
      `);
    const { outputs, diagnostics } = transform(files, { entry: [CORE_BRAND_APP] });
    const out = outputs[CORE_BRAND_APP]!;
    expect(diagnostics.length).toBe(0);
    expect(out).toContain('services.add("pkg:IThing#primary", KeyedThing,');
  });
});
