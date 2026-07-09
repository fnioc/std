// NullLifetime -- ported from the reference hosting runtime's `NullLifetime`.
// A minimal {@link IHostLifetime} that does nothing.

import type { IHostLifetime } from "@rhombus-std/hosting.core";
import type { AbortSignal } from "@rhombus-std/primitives";

/** A minimalistic {@link IHostLifetime} that does nothing. */
export class NullLifetime implements IHostLifetime {
  public waitForStart(_abortSignal: AbortSignal): Promise<void> {
    return Promise.resolve();
  }

  public stop(_abortSignal: AbortSignal): Promise<void> {
    return Promise.resolve();
  }
}
