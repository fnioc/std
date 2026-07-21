// The application builder's services slot (§107). `HostApplicationBuilder`
// exposes `services` as ONE mutable slot over an immutable manifest chain, and
// hands that same slot to its `logging` and `metrics` sub-builders. This suite
// pins the property that fell out of the immutable-manifest change: every
// registration route has to converge on the manifest `build()` reads.
//
// The failure this guards against is SILENT. Give each sub-builder its own copy
// of the manifest instead of a shared slot and everything still typechecks and
// runs — the registrations simply never reach the container.

import { Host } from '@rhombus-std/hosting/private/index';
import type { ILogger, ILoggerProvider } from '@rhombus-std/logging.core';
import { expect, test } from 'bun:test';

// The nameof-derived token logging registers its providers under (§40). Written
// as a literal because this package does not depend on @rhombus-std/logging --
// the same shape tests/logging.test uses for the ILogger<T> base.
const LOGGER_PROVIDER_TOKEN = '@rhombus-std/logging.core:ILoggerProvider';

/** A do-nothing provider, present only so its registration can be observed. */
class MarkerLoggerProvider implements ILoggerProvider {
  public createLogger(_categoryName: string): ILogger {
    return {
      isEnabled: () => false,
      log: () => {},
    } as unknown as ILogger;
  }

  public [Symbol.dispose](): void {}
}

test('builder.logging registrations reach the manifest build() reads', () => {
  const builder = Host.createEmptyApplicationBuilder();
  const marker = new MarkerLoggerProvider();

  builder.logging.addProvider(marker);

  // The chain is immutable, so this only holds because `logging` writes through
  // the SAME slot `builder.services` reads.
  const providers = builder.services.build().resolve<ILoggerProvider[]>(
    `Array<${LOGGER_PROVIDER_TOKEN}>`,
  );
  expect(providers).toContain(marker);
});

test('builder.services and builder.logging registrations both survive into the host', () => {
  const builder = Host.createEmptyApplicationBuilder();
  const marker = new MarkerLoggerProvider();

  // Interleaved on purpose: a fork would drop whichever route build() did not read.
  builder.services = builder.services.addValue('test:First', 'first');
  builder.logging.addProvider(marker);
  builder.services = builder.services.addValue('test:Second', 'second');

  const host = builder.build();
  expect(host.services.resolve<string>('test:First')).toBe('first');
  expect(host.services.resolve<string>('test:Second')).toBe('second');
  expect(
    host.services.resolve<ILoggerProvider[]>(`Array<${LOGGER_PROVIDER_TOKEN}>`),
  ).toContain(marker);

  host[Symbol.dispose]();
});

test('builder.metrics shares the same slot as builder.services', () => {
  const builder = Host.createEmptyApplicationBuilder();

  const before = builder.services;
  builder.metrics.services = builder.metrics.services.addValue('test:ViaMetrics', 'yes');

  expect(builder.services).not.toBe(before);
  expect(builder.services.build().resolve<string>('test:ViaMetrics')).toBe('yes');
});

test('asHostBuilder() replays its delegates into the live slot, not a snapshot', () => {
  const builder = Host.createEmptyApplicationBuilder();
  const adapter = builder.asHostBuilder();

  adapter.configureServices((_context, services) => services.addValue('test:Late', 'late'));
  // Registered AFTER the adapter captured the builder: a captured manifest
  // would have replayed the delegate onto a chain nobody builds from.
  builder.services = builder.services.addValue('test:Early', 'early');

  const host = builder.build();
  expect(host.services.resolve<string>('test:Early')).toBe('early');
  expect(host.services.resolve<string>('test:Late')).toBe('late');

  host[Symbol.dispose]();
});
