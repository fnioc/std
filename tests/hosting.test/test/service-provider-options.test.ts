import type { ServiceProviderOptions } from '@rhombus-std/hosting';
import { createDefaultServiceProviderOptions } from '@rhombus-std/hosting/private/default-config';
import { HostBuilder, type IHostEnvironment } from '@rhombus-std/hosting/private/index';
import { expect, test } from 'bun:test';

function fakeEnvironment(environmentName: string): IHostEnvironment {
  // createDefaultServiceProviderOptions only reads environmentName (through the
  // standalone HostEnvironmentEnvAugmentations.isDevelopment), so the rest of the
  // IHostEnvironment surface is irrelevant to this unit.
  return { environmentName } as IHostEnvironment;
}

/**
 * ServiceProviderOptions declares its properties readonly, but
 * useDefaultServiceProvider's configure delegate is handed a fresh options
 * object it is expected to mutate in place -- the only channel back to the
 * builder, since the delegate returns void. Until that contradiction is
 * settled, these tests write through a mutable view rather than fight the
 * type at every call site.
 */
type MutableServiceProviderOptions = { -readonly [K in keyof ServiceProviderOptions]: ServiceProviderOptions[K]; };
function asMutable(options: ServiceProviderOptions): MutableServiceProviderOptions {
  return options as MutableServiceProviderOptions;
}

test('createDefaultServiceProviderOptions enables validation only in Development', () => {
  expect(createDefaultServiceProviderOptions(fakeEnvironment('Development'))).toEqual({ validateScopes: true,
    validateOnBuild: true });
  expect(createDefaultServiceProviderOptions(fakeEnvironment('Production'))).toEqual({ validateScopes: false,
    validateOnBuild: false });
});

test('useDefaultServiceProvider threads validateOnBuild into the provider build', () => {
  // A registration whose dependency is never registered is unconstructable, so
  // an eager validate-on-build fails the whole build.
  function addBrokenService(builder: HostBuilder): void {
    builder.configureServices((_context, services) => {
      return services.addClass('test:Broken', class Broken {}, [['test:Missing']]);
    });
  }

  // Without options the build stays lazy -- the hole is never touched.
  const lazy = new HostBuilder();
  addBrokenService(lazy);
  expect(() => lazy.build()).not.toThrow();

  // With validateOnBuild the hole is caught eagerly.
  const validated = new HostBuilder();
  addBrokenService(validated);
  validated.useDefaultServiceProvider((options) => {
    asMutable(options).validateOnBuild = true;
  });
  expect(() => validated.build()).toThrow();
});

test('useDefaultServiceProvider validate-on-build accepts a sound host graph (framework services validate cleanly)', () => {
  const builder = new HostBuilder();
  builder.useDefaultServiceProvider((options) => {
    const mutable = asMutable(options);
    mutable.validateScopes = true;
    mutable.validateOnBuild = true;
  });
  expect(() => builder.build()).not.toThrow();
});

test('the last useDefaultServiceProvider call wins', () => {
  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    return services.addClass('test:Broken', class Broken {}, [['test:Missing']]);
  });
  // The first call would validate the (broken) graph; the second replaces it with
  // a no-validation options object, so the build stays lazy and does not throw.
  builder.useDefaultServiceProvider((options) => {
    asMutable(options).validateOnBuild = true;
  });
  builder.useDefaultServiceProvider((options) => {
    asMutable(options).validateOnBuild = false;
  });
  expect(() => builder.build()).not.toThrow();
});
