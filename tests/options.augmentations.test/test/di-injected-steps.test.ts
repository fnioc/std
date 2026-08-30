// The DI-injected configure / postConfigure / validate pipeline steps (#42): each
// resolves its dependency types from the provider at materialization time and
// passes the instances to the callback as trailing arguments, after the options
// value. Exercised through the public authoring surface with hand-written type
// nodes -- the caller supplies <Deps> explicitly, since the type array alone
// can't recover the Deps tuple by inference.

import { di, noop } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { type IOptions, OptionsValidationError } from '@rhombus-std/options';
import { getConfigureManifest, getPostConfigureManifest, getValidateManifest, optionsAddressType } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  url: string;
  retries: number;
  note: string;
}

class UrlProvider {
  readonly base = 'http://svc';
}

const OPTIONS_TYPE: Type = Type.from('test:WidgetOptions');
const URL_PROVIDER_TYPE: Type = Type.from('test:UrlProvider');
const RETRY_POLICY_TYPE: Type = Type.from('test:RetryPolicy');
const SUFFIX_TYPE: Type = Type.from('test:Suffix');

function baseOptions(): WidgetOptions {
  return { url: '', retries: 0, note: '' };
}

describe('configure — DI-injected', () => {
  test('resolves a class dep and passes it after the options value', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.add(URL_PROVIDER_TYPE, UrlProvider, Type.ctor(URL_PROVIDER_TYPE, [[]]), 'singleton');
    services = services.addOptions(OPTIONS_TYPE, baseOptions);
    services = services.add(getConfigureManifest<[UrlProvider]>(OPTIONS_TYPE, [URL_PROVIDER_TYPE], (options: WidgetOptions, urls) => {
      options.url = urls.base;
    }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(OPTIONS_TYPE));

    expect(options.value.url).toBe('http://svc');
  });

  test('resolves several deps, injected positionally in type order', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.add(URL_PROVIDER_TYPE, UrlProvider, Type.ctor(URL_PROVIDER_TYPE, [[]]), 'singleton');
    services = services.addValue(RETRY_POLICY_TYPE, { attempts: 4 });
    services = services.addOptions(OPTIONS_TYPE, baseOptions);
    services = services.add(getConfigureManifest<[UrlProvider, { attempts: number; }]>(OPTIONS_TYPE, [
      URL_PROVIDER_TYPE,
      RETRY_POLICY_TYPE,
    ], (options: WidgetOptions, urls, policy) => {
      options.url = urls.base;
      options.retries = policy.attempts;
    }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(OPTIONS_TYPE));

    expect(options.value).toEqual({ url: 'http://svc', retries: 4, note: '' });
  });

  test('a DI configure composes with a plain configure delegate', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.add(URL_PROVIDER_TYPE, UrlProvider, Type.ctor(URL_PROVIDER_TYPE, [[]]), 'singleton');
    services = services.addOptions(OPTIONS_TYPE, baseOptions);
    services = services.add(getConfigureManifest(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.note = 'plain';
    }));
    services = services.add(getConfigureManifest<[UrlProvider]>(OPTIONS_TYPE, [URL_PROVIDER_TYPE], (options: WidgetOptions, urls) => {
      options.url = urls.base;
    }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(OPTIONS_TYPE));

    expect(options.value.url).toBe('http://svc');
    expect(options.value.note).toBe('plain');
  });
});

describe('postConfigure — DI-injected', () => {
  test('runs after configure with a resolved dep', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addValue(SUFFIX_TYPE, { text: '!' });
    services = services.addOptions(OPTIONS_TYPE, baseOptions);
    services = services.add(getConfigureManifest(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.note = 'base';
    }));
    services = services.add(getPostConfigureManifest<[{ text: string; }]>(OPTIONS_TYPE, [SUFFIX_TYPE], (options: WidgetOptions, suffix) => {
      options.note += suffix.text;
    }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(OPTIONS_TYPE));

    expect(options.value.note).toBe('base!');
  });
});

describe('validate — DI-injected', () => {
  const LIMIT_TYPE: Type = Type.from('test:Limit');

  function servicesWithLimit(size: number, max: number): Manifest<unknown> {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addValue(LIMIT_TYPE, { max });
    services = services.addOptions(OPTIONS_TYPE, () => ({ ...baseOptions(), retries: size }));
    return services;
  }

  test('a passing predicate resolves the options without throwing', () => {
    let services = servicesWithLimit(3, 10);
    services = services.add(getValidateManifest<[{ max: number; }]>(OPTIONS_TYPE, [LIMIT_TYPE], (options: WidgetOptions, limit) => options.retries <= limit.max, 'retries over limit'));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();

    expect(() => {
      const options: IOptions<WidgetOptions> = provider.resolve(
        optionsAddressType(OPTIONS_TYPE),
      );
      return options;
    }).not.toThrow();
  });

  test('a failing predicate surfaces the failure message', () => {
    let services = servicesWithLimit(50, 10);
    services = services.add(getValidateManifest<[{ max: number; }]>(OPTIONS_TYPE, [LIMIT_TYPE], (options: WidgetOptions, limit) => options.retries <= limit.max, 'retries over limit'));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();

    expect(() => {
      const options: IOptions<WidgetOptions> = provider.resolve(
        optionsAddressType(OPTIONS_TYPE),
      );
      return options;
    }).toThrow(OptionsValidationError);
    expect(() => {
      const options: IOptions<WidgetOptions> = provider.resolve(
        optionsAddressType(OPTIONS_TYPE),
      );
      return options;
    }).toThrow('retries over limit');
  });

  test('a failing predicate with no message uses the default', () => {
    let services = servicesWithLimit(50, 10);
    services = services.add(getValidateManifest<[{ max: number; }]>(OPTIONS_TYPE, [LIMIT_TYPE], (options: WidgetOptions, limit) => options.retries <= limit.max));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();

    expect(() => {
      const options: IOptions<WidgetOptions> = provider.resolve(
        optionsAddressType(OPTIONS_TYPE),
      );
      return options;
    }).toThrow('A validation error has occurred.');
  });
});
