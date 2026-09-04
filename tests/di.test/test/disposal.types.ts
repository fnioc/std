// Type-level check that disposability lives on `IDisposableServiceProvider` alone: a scope's
// provider binds under `using` and `await using` as it stands, while the resolution interface
// carries no disposal at all. Never executed: the file earns its keep through `lint`
// (`tsc --noEmit`), which is why the name keeps it out of bun's test glob, like
// `object-assign.types.ts` and `get-service-value.types.ts`.

import type { IDisposableServiceProvider, IServiceProvider } from '@rhombus-std/di.core';

declare const resolver: IServiceProvider;
declare const provider: IDisposableServiceProvider;

// @ts-expect-error the resolution interface carries no synchronous disposal.
export const noDispose = resolver[Symbol.dispose];
// @ts-expect-error the resolution interface carries no asynchronous disposal.
export const noAsyncDispose = resolver[Symbol.asyncDispose];

provider[Symbol.dispose]() satisfies void;
provider[Symbol.asyncDispose]() satisfies PromiseLike<void>;

export function bindsUnderUsing(): void {
  using _scope = provider;
}

export async function bindsUnderAwaitUsing(): Promise<void> {
  await using _scope = provider;
}
