import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Broader-principle guard (issue #45): manual token manipulation anywhere in
// the with-transformer example is a smell — it means the transformer left an
// authoring surface uncovered. Cheap source-text checks, no new lint
// infrastructure: the example must never import `nameof`, and every
// `resolve<T>()` / `resolveAsync<T>()` call must be tokenless (no
// string-literal token arg).

const EXAMPLE_SOURCE = join(
  import.meta.dir,
  "../../../examples/di.examples.with-transformer/src/main.ts",
);

describe("with-transformer example never manually manipulates tokens", () => {
  const source = readFileSync(EXAMPLE_SOURCE, "utf8");

  test("never imports nameof", () => {
    expect(source).not.toMatch(/\bnameof\b/);
  });

  test("never calls resolve<T>()/resolveAsync<T>() with a raw string-literal token argument", () => {
    // A raw-token call looks like `.resolve<...>("some:token")` /
    // `.resolveAsync<...>("some:token")` — a string literal as the value
    // argument. The tokenless authoring form always has an EMPTY argument
    // list: `.resolve<...>()` / `.resolveAsync<...>()`.
    const rawTokenCall = /\.resolve(?:Async)?<[^>]*>\(\s*["'`]/;
    expect(source).not.toMatch(rawTokenCall);
  });
});
