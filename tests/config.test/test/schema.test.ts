// Compile-time regression coverage for the runtime `Schema` + `Infer` +
// `OPTIONAL` design. `bun test` does not type-check anything; what makes these
// assertions load-bearing is the package's `lint` script running
// `tsc -p tsconfig.json` (which includes test/**/*). The `@ts-expect-error`
// lines below fail the build with "Unused '@ts-expect-error' directive" if the
// types ever silently loosen.

import { type Infer, OPTIONAL, type Schema } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

// A valid schema authored inline with the OPTIONAL symbol wrapper compiles, and
// Infer yields the expected shape (required keys required, optional keys `?`).
const serverSchema = {
  Host: "string",
  Port: "number",
  Ssl: { [OPTIONAL]: "boolean" },
} as const satisfies Schema;

type ServerConfig = Infer<typeof serverSchema>;

const ok: ServerConfig = { Host: "h", Port: 8080 }; // Ssl omittable
const ok2: ServerConfig = { Host: "h", Port: 8080, Ssl: true };
// @ts-expect-error -- Port must be a number, not a string
const bad: ServerConfig = { Host: "h", Port: "80" };
// @ts-expect-error -- Host is required
const missing: ServerConfig = { Port: 8080 };

// The PR #18 collision case, now permanent: a real string property literally
// named "optional" is a NESTED key, NOT the optional wrapper (the wrapper is
// keyed by the OPTIONAL symbol). So `optional` is REQUIRED.
type WithLiteralOptional = Infer<{ optional: "string"; flag: { [OPTIONAL]: "boolean" } }>;
const collide: WithLiteralOptional = { optional: "x" }; // flag is `?`, optional is required
// @ts-expect-error -- the `optional` property is required, not omittable
const collideMissing: WithLiteralOptional = { flag: true };

// The OPTIONAL branch precedes the object branch: an OptionalSchema infers to
// `Inner | undefined`, not to an object with a symbol key.
type OptionalLeaf = Infer<{ [OPTIONAL]: "number" }>;
const optLeaf1: OptionalLeaf = 5;
const optLeaf2: OptionalLeaf = undefined;

// Nested objects recurse.
type Nested = Infer<{ Server: { Host: "string" }; Db: { Url: "string" } }>;
const nested: Nested = { Server: { Host: "h" }, Db: { Url: "u" } };

describe("Schema / Infer / OPTIONAL", () => {
  test("the compile-time fixtures above hold at runtime too", () => {
    expect(ok.Host).toBe("h");
    expect(ok2.Ssl).toBe(true);
    expect(bad.Port as unknown).toBe("80");
    expect(missing.Port).toBe(8080);
    expect(collide.optional).toBe("x");
    expect(collideMissing.flag).toBe(true);
    expect(optLeaf1).toBe(5);
    expect(optLeaf2).toBeUndefined();
    expect(nested.Server.Host).toBe("h");
    expect(typeof OPTIONAL).toBe("symbol");
  });
});
