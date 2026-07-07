import { describe, expect, test } from "bun:test";
import { depsArrayFor, fixture, transform } from "./harness.js";

// Collection-token derivation (#48). The three collection syntaxes — `T[]`,
// `Array<T>`, `Iterable<T>` — all derive a wrapper token via the ordinary
// closed-generic derivation: `T[]` and `Array<T>` both tokenize as
// `Array<elementToken>` (TypeScript normalizes `T[]` to the `Array` reference),
// and `Iterable<T>` as `Iterable<elementToken>`. Both a tokenless `resolve<…>()`
// call and a constructor-parameter type reach the same derivation, so injecting
// a collection needs no special authoring — the runtime aggregates on the
// wrapper token.

describe("collection-token lowering — resolve<…>()", () => {
  function resolveEmit(typeArg: string): string {
    const src = `
      interface IFoo {}
      declare const scope: any;
      const x = scope.resolve<${typeArg}>();
    `;
    const { output } = transform(fixture(src));
    return output.match(/const x = (.*);/)![1]!;
  }

  test("resolve<IFoo[]>() lowers to the Array<…> wrapper token", () => {
    expect(resolveEmit("IFoo[]")).toBe("scope.resolve(\"Array<./app:IFoo>\")");
  });

  test("resolve<Array<IFoo>>() lowers to the SAME Array<…> token as IFoo[]", () => {
    expect(resolveEmit("Array<IFoo>")).toBe("scope.resolve(\"Array<./app:IFoo>\")");
  });

  test("resolve<Iterable<IFoo>>() lowers to the Iterable<…> wrapper token", () => {
    expect(resolveEmit("Iterable<IFoo>")).toBe(
      "scope.resolve(\"Iterable<./app:IFoo>\")",
    );
  });

  test("resolveAsync<IFoo[]>() lowers to resolveAsync with the same wrapper token", () => {
    const src = `
      interface IFoo {}
      declare const scope: any;
      const x = scope.resolveAsync<IFoo[]>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain("scope.resolveAsync(\"Array<./app:IFoo>\")");
  });
});

describe("collection-token lowering — constructor parameters", () => {
  test("a T[] ctor param derives the Array<…> wrapper token as its dep slot", () => {
    const src = `
      interface IFoo {}
      class Consumer {
        constructor(readonly plugins: IFoo[]) {}
      }
      declare const services: any;
      services.add<Consumer>(Consumer).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    expect(depsArrayFor(output, "Consumer")).toBe("[[\"Array<./app:IFoo>\"]]");
  });

  test("an Iterable<T> ctor param derives the Iterable<…> wrapper token", () => {
    const src = `
      interface IFoo {}
      class Consumer {
        constructor(readonly plugins: Iterable<IFoo>) {}
      }
      declare const services: any;
      services.add<Consumer>(Consumer).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    expect(depsArrayFor(output, "Consumer")).toBe("[[\"Iterable<./app:IFoo>\"]]");
  });
});
