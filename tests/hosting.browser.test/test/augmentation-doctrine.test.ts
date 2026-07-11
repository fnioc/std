// Type regression (augmentation doctrine): a concrete HostBuilder from
// @rhombus-std/hosting must expose `useBrowserLifetime` — a member declared ONLY
// on the IHostBuilder interface by @rhombus-std/hosting.browser — purely through
// the cross-package `interface HostBuilder extends IHostBuilder` chain, with NO
// class-side merge onto hosting's internal HostBuilder subpath (the deleted #168
// publish-hazard). `tsc --noEmit` (the package lint) fails to compile the call
// below if that chain regresses; bun test exercises the @augment runtime install.

import { HostBuilder } from '@rhombus-std/hosting';
// Side-effect import: brings hosting.browser's `useBrowserLifetime` IHostBuilder
// interface merge (and its registry registration) into the program.
import '@rhombus-std/hosting.browser';
import { expect, test } from 'bun:test';

test('HostBuilder exposes useBrowserLifetime via the interface-extends chain', () => {
  const builder = new HostBuilder();

  const returned = builder.useBrowserLifetime();

  expect(returned).toBe(builder);
});
