// Owned `ReadableStream<R>` typing (like ./abort.ts) for the one stream type
// that reaches a public signature — fileproviders.core's
// `IFileInfo.createReadStream(): ReadableStream<Uint8Array>`. Only the members
// this repo relies on are precise; the plumbing whose shape diverges across
// platform stream variants is left loose (`any`) so an implementer on any
// variant stays assignable to it.

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
