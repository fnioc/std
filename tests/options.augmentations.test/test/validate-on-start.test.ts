// validateOnStart (black-box, public surface): mark an options registration for
// startup validation, then resolve the built-in IStartupValidator and force it.
// Exercised through the authoring surface with hand-written tokens (no
// transformer), the way the host resolves the validator at boot.

import { ServiceManifest } from '@rhombus-std/di';
import { type IStartupValidator, OptionsValidationError } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface ServerOptions {
  port: number;
}

const OPTIONS_TOKEN = 'test:ServerOptions';
const OTHER_TOKEN = 'test:OtherOptions';
// The tokenfor-derived token the host resolves the validator under (§40). A
// no-transformer consumer writes the literal string.
const STARTUP_VALIDATOR_TOKEN = '@rhombus-std/options:IStartupValidator';

describe('validateOnStart', () => {
  test('registers a resolvable IStartupValidator', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 8080 })).as('singleton');
    services = services.validateOnStart(OPTIONS_TOKEN);

    const provider = services.build().createScope('singleton');
    const validator = provider.resolve<IStartupValidator>(STARTUP_VALIDATOR_TOKEN);

    expect(typeof validator.validate).toBe('function');
  });

  test('valid options -> validate() does not throw', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 8080 })).as('singleton');
    services = services.validate<ServerOptions>(OPTIONS_TOKEN, (o) => o.port > 0, 'port must be positive');
    services = services.validateOnStart(OPTIONS_TOKEN);

    const provider = services.build().createScope('singleton');
    const validator = provider.resolve<IStartupValidator>(STARTUP_VALIDATOR_TOKEN);

    expect(() => validator.validate()).not.toThrow();
  });

  test('a failing validate step surfaces as OptionsValidationError', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 0 })).as('singleton');
    services = services.validate<ServerOptions>(OPTIONS_TOKEN, (o) => o.port > 0, 'port must be positive');
    services = services.validateOnStart(OPTIONS_TOKEN);

    const provider = services.build().createScope('singleton');
    const validator = provider.resolve<IStartupValidator>(STARTUP_VALIDATOR_TOKEN);

    expect(() => validator.validate()).toThrow(OptionsValidationError);
    expect(() => validator.validate()).toThrow('port must be positive');
  });

  test('two failing registrations aggregate into one AggregateError', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 0 })).as('singleton');
    services = services.validate<ServerOptions>(OPTIONS_TOKEN, (o) => o.port > 0, 'first bad');
    services = services.validateOnStart(OPTIONS_TOKEN);

    services = services.addOptions<ServerOptions>(OTHER_TOKEN, () => ({ port: -1 })).as('singleton');
    services = services.validate<ServerOptions>(OTHER_TOKEN, (o) => o.port > 0, 'second bad');
    services = services.validateOnStart(OTHER_TOKEN);

    const provider = services.build().createScope('singleton');
    const validator = provider.resolve<IStartupValidator>(STARTUP_VALIDATOR_TOKEN);

    try {
      validator.validate();
      throw new Error('expected validate() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toHaveLength(2);
    }
  });
});
