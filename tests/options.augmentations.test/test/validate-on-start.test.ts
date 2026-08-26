// validateOnStart (black-box, public surface): mark an options registration for
// startup validation, then resolve the built-in IStartupValidator and force it.
// Exercised through the authoring surface with hand-written type nodes,
// the way the host resolves the validator at boot.

import { di, noop } from '@rhombus-std/di';
import { Manifest, Type } from '@rhombus-std/di.core';
import { type IStartupValidator, OptionsValidationError } from '@rhombus-std/options';
import { getValidateManifest, getValidateOnStartManifest } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface ServerOptions {
  port: number;
}

const OPTIONS_TYPE: Type = Type.from('test:ServerOptions');
const OTHER_TYPE: Type = Type.from('test:OtherOptions');
// The typefor-derived type the host resolves the validator under. A
// no-transformer consumer writes the literal string.
const STARTUP_VALIDATOR_TYPE: Type = Type.from('@rhombus-std/options:IStartupValidator');

describe('validateOnStart', () => {
  test('registers a resolvable IStartupValidator', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 8080 }));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const validator: IStartupValidator = provider.resolve(STARTUP_VALIDATOR_TYPE);

    expect(typeof validator.validate).toBe('function');
  });

  test('valid options -> validate() does not throw', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 8080 }));
    services = services.addMany(getValidateManifest(OPTIONS_TYPE, (o: ServerOptions) => o.port > 0, 'port must be positive'));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const validator: IStartupValidator = provider.resolve(STARTUP_VALIDATOR_TYPE);

    expect(() => validator.validate()).not.toThrow();
  });

  test('a failing validate step surfaces as OptionsValidationError', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 0 }));
    services = services.addMany(getValidateManifest(OPTIONS_TYPE, (o: ServerOptions) => o.port > 0, 'port must be positive'));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const validator: IStartupValidator = provider.resolve(STARTUP_VALIDATOR_TYPE);

    expect(() => validator.validate()).toThrow(OptionsValidationError);
    expect(() => validator.validate()).toThrow('port must be positive');
  });

  test('two failing registrations aggregate into one AggregateError', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 0 }));
    services = services.addMany(getValidateManifest(OPTIONS_TYPE, (o: ServerOptions) => o.port > 0, 'first bad'));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));

    services = services.addOptions(OTHER_TYPE, () => ({ port: -1 }));
    services = services.addMany(getValidateManifest(OTHER_TYPE, (o: ServerOptions) => o.port > 0, 'second bad'));
    services = services.addMany(getValidateOnStartManifest(OTHER_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const validator: IStartupValidator = provider.resolve(STARTUP_VALIDATOR_TYPE);

    try {
      validator.validate();
      throw new Error('expected validate() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toHaveLength(2);
    }
  });
});
