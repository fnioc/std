import { ServiceManifest } from "@rhombus-std/di";
import type { Token } from "@rhombus-std/di.core";
import { describe, expect, test } from "bun:test";

// Collection resolution (#48). Resolving the wrapper token `Array<T>` / `T[]`
// (both derive to `Array<T>`) or `Iterable<T>` follows a two-step lookup:
//   1. an as-requested binding registered against the wrapper token itself
//      short-circuits;
//   2. else aggregate ALL registrations of T in REGISTRATION ORDER, wrapped as
//      requested — the aggregate's last element being the bare-T (last-wins)
//      winner. An unregistered T aggregates to EMPTY (bare unregistered T
//      still throws). Each element resolves per its own registration's
//      lifetime/caching.
//
// The engine only ever sees string tokens, exactly as post-lowering — the tests
// hand-write the wrapper token the transformer would derive.

const ELEMENT: Token = "pkg:IPlugin";
const ARRAY: Token = "Array<pkg:IPlugin>";
const ITERABLE: Token = "Iterable<pkg:IPlugin>";

describe("collection aggregation — step 2 (fallback)", () => {
  test("Array<T> aggregates every registration of T in registration order", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    services.addValue(ELEMENT, "b");
    services.addValue(ELEMENT, "c");

    const resolved = services.build().resolve<string[]>(ARRAY);
    expect(resolved).toEqual(["a", "b", "c"]);
  });

  test("the aggregate's LAST element is the bare-T (last-wins) winner", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "first");
    services.addValue(ELEMENT, "last");

    const root = services.build();
    const array = root.resolve<string[]>(ARRAY);
    expect(array[array.length - 1]).toBe(root.resolve<string>(ELEMENT));
    expect(root.resolve<string>(ELEMENT)).toBe("last");
  });

  test("a single registration aggregates to a one-element collection", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "only");
    expect(services.build().resolve<string[]>(ARRAY)).toEqual(["only"]);
  });

  test("aggregate of an UNREGISTERED T is EMPTY (no throw)", () => {
    const services = new ServiceManifest<"singleton">();
    const root = services.build();
    expect(root.resolve<string[]>(ARRAY)).toEqual([]);
  });

  test("bare unregistered T still THROWS while its collection is empty", () => {
    const services = new ServiceManifest<"singleton">();
    const root = services.build();
    expect(root.resolve<string[]>(ARRAY)).toEqual([]);
    expect(() => root.resolve<string>(ELEMENT)).toThrow();
  });
});

describe("collection aggregation — step 1 (as-requested short-circuit)", () => {
  test("a binding registered against the wrapper token wins, no aggregation", () => {
    const explicit = ["x", "y"];
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    services.addValue(ELEMENT, "b");
    // Register the wrapper type ITSELF — step 1 short-circuits step 2.
    services.addValue(ARRAY, explicit);

    expect(services.build().resolve<string[]>(ARRAY)).toBe(explicit);
  });

  test("a wrapper binding factory is used verbatim over the aggregate", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    services.addFactory(ARRAY, () => ["custom"]);

    expect(services.build().resolve<string[]>(ARRAY)).toEqual(["custom"]);
  });
});

describe("Iterable<T> wrapper", () => {
  test("Iterable<T> aggregates the same elements, wrapped as a re-iterable view", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    services.addValue(ELEMENT, "b");

    const iterable = services.build().resolve<Iterable<string>>(ITERABLE);
    // Not a plain array — a distinct iterable honoring the requested container.
    expect(Array.isArray(iterable)).toBe(false);
    expect([...iterable]).toEqual(["a", "b"]);
    // Re-iterable: a second pass yields the same elements.
    expect([...iterable]).toEqual(["a", "b"]);
  });

  test("Iterable<T> of an unregistered T is an empty iterable", () => {
    const services = new ServiceManifest<"singleton">();
    expect([...services.build().resolve<Iterable<string>>(ITERABLE)]).toEqual([]);
  });
});

describe("element lifetime / scoping", () => {
  test("each element honors its OWN registration's lifetime — singletons cache", () => {
    class Alpha {
      public readonly id = Math.random();
    }
    class Beta {
      public readonly id = Math.random();
    }
    const services = new ServiceManifest<"singleton">();
    services.add(ELEMENT, Alpha).as("singleton");
    services.add(ELEMENT, Beta).as("singleton");

    const root = services.build().createScope("singleton");
    const first = root.resolve<Alpha[]>(ARRAY);
    const second = root.resolve<Alpha[]>(ARRAY);

    // Both elements are singleton-cached: re-resolving the collection returns
    // the identical element instances.
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
    // The last element is the bare-T (last-wins) singleton instance.
    expect(first[1]).toBe(root.resolve<Beta>(ELEMENT));
  });

  test("a transient element is fresh per collection resolve", () => {
    class Transient {
      public readonly id = Math.random();
    }
    const services = new ServiceManifest<"singleton">();
    services.add(ELEMENT, Transient); // no .as — transient

    const root = services.build().createScope("singleton");
    const a = root.resolve<Transient[]>(ARRAY);
    const b = root.resolve<Transient[]>(ARRAY);
    expect(a[0]).not.toBe(b[0]);
  });

  test("distinct-scope elements: a scoped element differs across child scopes", () => {
    class Scoped {
      public readonly id = Math.random();
    }
    const services = new ServiceManifest<"singleton" | "request">();
    services.add(ELEMENT, Scoped).as("request");

    const root = services.build().createScope("singleton");
    const reqA = root.createScope("request");
    const reqB = root.createScope("request");
    expect(reqA.resolve<Scoped[]>(ARRAY)[0]).not.toBe(
      reqB.resolve<Scoped[]>(ARRAY)[0],
    );
    // Within one request scope the scoped element is stable.
    expect(reqA.resolve<Scoped[]>(ARRAY)[0]).toBe(
      reqA.resolve<Scoped[]>(ARRAY)[0],
    );
  });
});

describe("collection probes — isService / tryResolve", () => {
  test("isService is true for a collection token even with no registrations", () => {
    const root = new ServiceManifest<"singleton">().build();
    expect(root.isService(ARRAY)).toBe(true);
    expect(root.isService(ITERABLE)).toBe(true);
  });

  test("tryResolve of a collection token returns the aggregate, not undefined", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    const root = services.build();
    expect(root.tryResolve<string[]>(ARRAY)).toEqual(["a"]);
    // Empty aggregate is still a defined collection, never undefined.
    const empty = new ServiceManifest<"singleton">().build();
    expect(empty.tryResolve<string[]>(ARRAY)).toEqual([]);
  });
});

describe("collection tokens as DEPENDENCY SLOTS", () => {
  // A collection slot is always SATISFIABLE in signature selection — the
  // aggregate may be empty, and an empty collection is a valid resolution —
  // exactly as isService/tryResolve probe it. This is what lets a constructor
  // mirror the reference's `IEnumerable<T>` injection.
  class Host {
    public constructor(public readonly plugins: readonly string[]) {}
  }

  test("a ctor Array<T> slot injects the aggregated registrations", () => {
    const services = new ServiceManifest<"singleton">();
    services.addValue(ELEMENT, "a");
    services.addValue(ELEMENT, "b");
    services.add("pkg:Host", Host, [[ARRAY]]);

    const host = services.build().resolve<Host>("pkg:Host");
    expect(host.plugins).toEqual(["a", "b"]);
  });

  test("an EMPTY aggregate still satisfies the signature (injects [])", () => {
    const services = new ServiceManifest<"singleton">();
    services.add("pkg:Host", Host, [[ARRAY]]);

    const host = services.build().resolve<Host>("pkg:Host");
    expect(host.plugins).toEqual([]);
  });
});

describe("async collection resolution", () => {
  test("resolveAsync<Array<T>> settles an in-flight element through one Pending", async () => {
    const DEP: Token = "pkg:IDep";
    const services = new ServiceManifest<"singleton">();
    // An honest async value keyed at the Promise<T> token — the fallback the
    // spine takes for a bare IDep dependency in async mode.
    services.addFactory(`Promise<${DEP}>`, async () => "dep");
    // A synchronous element, and one whose construction awaits the async dep
    // (resolved via the Promise<T> fallback → an in-flight element the
    // collection must settle).
    services.addFactory(ELEMENT, () => "plain");
    services.addFactory(ELEMENT, (dep: string) => `needs:${dep}`, [[DEP]]);

    const array = await services.build().resolveAsync<string[]>(ARRAY);
    expect(array).toEqual(["plain", "needs:dep"]);
  });
});
