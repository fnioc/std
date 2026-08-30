// Type-level check for §225 line 3966 — "No dispose members on ServiceProvider or the func-head
// surface." Never executed: the file earns its keep through `lint` (`tsc --noEmit`), which is why
// the name keeps it out of bun's test glob, mirroring `object-assign.types.ts` and
// `get-service-value.types.ts`. A concrete model-minted scope object happens to carry both
// symbols at runtime (see `standard-lifetime-model-disposal.test.ts`), but the interface itself
// grants neither.

import type { IServiceProvider } from '@rhombus-std/di.core';

declare const provider: IServiceProvider;

// @ts-expect-error
provider[Symbol.dispose];
// @ts-expect-error
provider[Symbol.asyncDispose];
