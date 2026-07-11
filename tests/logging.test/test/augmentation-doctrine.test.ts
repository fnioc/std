// Type regression (augmentation doctrine): a concrete LoggingBuilder must expose
// members declared ONLY on the ILoggingBuilder interface, reaching them purely
// through the `interface LoggingBuilder extends ILoggingBuilder` merge beside the
// class — with no class-side restatement of the members. `tsc --noEmit` (the
// package lint) fails to compile the `addProvider` call below if that extends
// merge regresses; bun test exercises the @augment runtime install.

import { ServiceManifest } from '@rhombus-std/di';
import { LoggingBuilder } from '@rhombus-std/logging';
import type { ILoggerProvider } from '@rhombus-std/logging.core';
import { expect, test } from 'bun:test';
import { RecordingProvider } from './helpers';

test('LoggingBuilder inherits interface-augmented members via the extends merge', () => {
  const builder = new LoggingBuilder(new ServiceManifest());
  const provider: ILoggerProvider = new RecordingProvider();

  // `addProvider` lives only on ILoggingBuilder (its interface-side merge), never
  // on the concrete class — so this both type-checks (extends chain) and runs
  // (prototype install), returning the builder for chaining.
  const returned = builder.addProvider(provider);

  expect(returned).toBe(builder);
});
