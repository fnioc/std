// Type-level check that `IServiceProvider` is disposable in both forms, so a provider — the
// container's own or a scope's — binds under `using` and `await using` as it stands. Never
// executed: the file earns its keep through `lint` (`tsc --noEmit`), which is why the name keeps
// it out of bun's test glob, like `object-assign.types.ts` and `get-service-value.types.ts`.

import type { IServiceProvider } from '@rhombus-std/di.core';

declare const provider: IServiceProvider;

provider[Symbol.dispose]() satisfies void;
provider[Symbol.asyncDispose]() satisfies PromiseLike<void>;

export function bindsUnderUsing(): void {
  using _scope = provider;
}

export async function bindsUnderAwaitUsing(): Promise<void> {
  await using _scope = provider;
}
