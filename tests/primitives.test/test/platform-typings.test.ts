// Assignability tests for primitives' owned platform typings beyond abort --
// process (src/process.ts), streams (src/streams.ts), timers (src/timers.ts).
// This test package's program carries `types: ["bun"]` (unlike the library
// programs, which are pinned to zero ambient platform types), so it is the one
// place the owned structural interfaces can be checked against the real
// platform types.
//
//   - ProcessLike needs ONE-WAY assignability only (platform -> ours): we never
//     hand our process back to a platform API.
//   - ReadableStream's load-bearing direction is also platform -> ours: any
//     variant's implementer of IFileInfo.createReadStream must be able to
//     return its platform stream. The reverse (ours -> the FULL bun
//     interface) is deliberately not asserted -- bun-types extends its
//     variant with required consumer-convenience members lib.dom lacks, so a
//     common structural type cannot satisfy it (see primitives/src/streams.ts).

import type { ProcessLike, ReadableStream, TimeoutHandle } from "@rhombus-std/primitives";
import { clearTimeout, neverSignal, process, setTimeout } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

describe("process (owned typings)", () => {
  test("is the platform global", () => {
    expect(process).toBe(globalThis.process as unknown as ProcessLike);
  });

  test("the platform process satisfies ProcessLike", () => {
    // Type test: fails to compile if the platform process stops satisfying
    // the owned member subset.
    const typed: ProcessLike = globalThis.process;
    expect(typed.cwd()).toBe(globalThis.process.cwd());
  });
});

describe("ReadableStream (owned typings)", () => {
  test("platform streams assign to the owned type", () => {
    const platform = new globalThis.ReadableStream<Uint8Array>();

    // Type test: the load-bearing platform -> ours direction.
    const ours: ReadableStream<Uint8Array> = platform;

    expect(ours.locked).toBe(false);
  });
});

describe("timers (owned typings)", () => {
  test("are the platform globals", () => {
    // Identity assertions; the casts step around the deliberate typing
    // differences (opaque TimeoutHandle vs bun's number | Timer).
    expect(setTimeout as unknown).toBe(globalThis.setTimeout);
    expect(clearTimeout as unknown).toBe(globalThis.clearTimeout);
  });

  test("a handle round-trips through clearTimeout", () => {
    let fired = false;
    const handle: TimeoutHandle = setTimeout(() => {
      fired = true;
    }, 1_000);
    clearTimeout(handle);
    expect(fired).toBe(false);
  });
});

describe("neverSignal", () => {
  test("is inert", () => {
    expect(neverSignal.aborted).toBe(false);
    expect(neverSignal.reason).toBeUndefined();
    expect(neverSignal.dispatchEvent(new Event("abort"))).toBe(false);
    expect(() => {
      neverSignal.throwIfAborted();
    }).not.toThrow();

    let fired = false;
    neverSignal.addEventListener("abort", () => {
      fired = true;
    });
    expect(fired).toBe(false);
  });
});
