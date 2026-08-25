import { Type } from '@rhombus-std/di.core';
import { HostBuilder, type IHostEnvironment } from '@rhombus-std/hosting';
import { createDefaultServiceProviderOptions } from '@rhombus-std/hosting/private/default-config';
import { expect, test } from 'bun:test';

function fakeEnvironment(environmentName: string): IHostEnvironment {
  // createDefaultServiceProviderOptions only reads environmentName (through the
  // standalone HostEnvironmentEnvAugmentations.isDevelopment), so the rest of the
  // IHostEnvironment surface is irrelevant to this unit.
  return { environmentName } as IHostEnvironment;
}

test('createDefaultServiceProviderOptions enables validation only in Development', () => {
  expect(createDefaultServiceProviderOptions(fakeEnvironment('Development'))).toEqual({ validateOnBuild: true });
  expect(createDefaultServiceProviderOptions(fakeEnvironment('Production'))).toEqual({ validateOnBuild: false });
});

test('useDefaultServiceProvider threads validateOnBuild into the provider build', () => {
  // A registration whose dependency is never registered is unconstructable, so
  // an eager validate-on-build fails the whole build.
  function addBrokenService(builder: HostBuilder): void {
    builder.configureServices((_context, services) => {
      return services.add(Type.from('test:Broken'), class Broken {}, Type.ctor(Type.from('test:Broken'), [[Type.from('test:Missing')]]));
    });
  }

  // Without options the build stays lazy -- the hole is never touched.
  const lazy = new HostBuilder();
  addBrokenService(lazy);
  expect(() => lazy.build()).not.toThrow();

  // With validateOnBuild the hole is caught eagerly.
  const validated = new HostBuilder();
  addBrokenService(validated);
  validated.useDefaultServiceProvider((options) => ({ ...options, validateOnBuild: true }));
  expect(() => validated.build()).toThrow();
});

test('useDefaultServiceProvider validate-on-build accepts a sound host graph (framework services validate cleanly)', () => {
  const builder = new HostBuilder();
  builder.useDefaultServiceProvider((options) => ({ ...options, validateScopes: true, validateOnBuild: true }));
  expect(() => builder.build()).not.toThrow();
});

test('the last useDefaultServiceProvider call wins', () => {
  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    return services.add(Type.from('test:Broken'), class Broken {}, Type.ctor(Type.from('test:Broken'), [[Type.from('test:Missing')]]));
  });
  // The first call would validate the (broken) graph; the second replaces it with
  // a no-validation options object, so the build stays lazy and does not throw.
  builder.useDefaultServiceProvider((options) => ({ ...options, validateOnBuild: true }));
  builder.useDefaultServiceProvider((options) => ({ ...options, validateOnBuild: false }));
  expect(() => builder.build()).not.toThrow();
});
