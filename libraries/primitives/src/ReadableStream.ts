// Owned `ReadableStream<R>` typing -- the §39 recipe (see ./abort.ts) for the
// one stream type that appears in a PUBLIC signature
// (fileproviders.core's `IFileInfo.createReadStream(): ReadableStream<Uint8Array>`
// lands in the rolled d.ts). The members this repo relies on are precise, the
// plumbing whose shapes diverge across platform lib variants is
// present-but-loose (`any`).
//
// Assignability design: the LOAD-BEARING direction is platform -> ours -- an
// implementer of `IFileInfo` on ANY variant (lib.dom, @types/node web
// streams, bun-types) must be able to return its platform stream, so this
// interface carries only the member core COMMON to all three (asserted by a
// type test in tests/primitives.test). Full mutual assignability is
// impossible for one structural type: bun-types extends its variant with
// REQUIRED consumer-convenience members (`text`/`json`/`bytes`/`blob`/
// `values`) that lib.dom's variant lacks -- declaring them here would break
// the lib.dom implementer, omitting them means ours -> full-bun-interface
// needs a cast at the (currently hypothetical) call site that hands one of
// our streams to a bun API demanding the extended shape.

export interface ReadableStream<R = any> {
  readonly locked: boolean;
  cancel(reason?: any): Promise<void>;
  getReader: any; // loose: reader shape differs across lib.dom/@types/node variants
  pipeThrough: any;
  pipeTo: any;
  tee: any;
  /** Phantom use of R -- signature fidelity + variance; never present at runtime. */
  readonly __chunkType?: R;
}
