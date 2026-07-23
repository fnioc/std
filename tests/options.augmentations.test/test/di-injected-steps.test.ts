// The DI-injected configure / postConfigure / validate pipeline steps (#42): each
// resolves its dependency tokens from the provider at materialization time and
// passes the instances to the callback as trailing arguments, after the options
// value. Exercised through the public authoring surface with hand-written tokens
// (no transformer) -- the caller supplies <T, Deps> explicitly, since the token
// array alone (all strings) can't recover the Deps tuple by inference.

import { type IServiceManifest, ServiceManifest } from '@rhombus-std/di';
import { type IOptions, OptionsValidationError } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  url: string;
  retries: number;
  note: string;
}

class UrlProvider {
  readonly base = 'http://svc';
}

const OPTIONS_TOKEN = 'test:WidgetOptions';
const URL_PROVIDER_TOKEN = 'test:UrlProvider';
const RETRY_POLICY_TOKEN = 'test:RetryPolicy';
const SUFFIX_TOKEN = 'test:Suffix';

function baseOptions(): WidgetOptions {
  return { url: '', retries: 0, note: '' };
}

describe('configure — DI-injected', () => {
  test('resolves a class dep and passes it after the options value', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(URL_PROVIDER_TOKEN, UrlProvider, [[]], 'singleton');
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, baseOptions).as('singleton');
    services = services.configure<WidgetOptions, [UrlProvider]>(
      OPTIONS_TOKEN,
      [URL_PROVIDER_TOKEN],
      (options, urls) => {
        options.url = urls.base;
      },
    );

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value.url).toBe('http://svc');
  });

  test('resolves several deps, injected positionally in token order', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(URL_PROVIDER_TOKEN, UrlProvider, [[]], 'singleton');
    services = services.addValue(RETRY_POLICY_TOKEN, { attempts: 4 });
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, baseOptions).as('singleton');
    services = services.configure<WidgetOptions, [UrlProvider, { attempts: number; }]>(
      OPTIONS_TOKEN,
      [URL_PROVIDER_TOKEN, RETRY_POLICY_TOKEN],
      (options, urls, policy) => {
        options.url = urls.base;
        options.retries = policy.attempts;
      },
    );

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value).toEqual({ url: 'http://svc', retries: 4, note: '' });
  });

  test('a DI configure composes with a plain configure delegate', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(URL_PROVIDER_TOKEN, UrlProvider, [[]], 'singleton');
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, baseOptions).as('singleton');
    services = services.configure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.note = 'plain';
    });
    services = services.configure<WidgetOptions, [UrlProvider]>(
      OPTIONS_TOKEN,
      [URL_PROVIDER_TOKEN],
      (options, urls) => {
        options.url = urls.base;
      },
    );

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value.url).toBe('http://svc');
    expect(options.value.note).toBe('plain');
  });
});

describe('postConfigure — DI-injected', () => {
  test('runs after configure with a resolved dep', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(SUFFIX_TOKEN, { text: '!' });
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, baseOptions).as('singleton');
    services = services.configure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.note = 'base';
    });
    services = services.postConfigure<WidgetOptions, [{ text: string; }]>(
      OPTIONS_TOKEN,
      [SUFFIX_TOKEN],
      (options, suffix) => {
        options.note += suffix.text;
      },
    );

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value.note).toBe('base!');
  });
});

describe('validate — DI-injected', () => {
  const LIMIT_TOKEN = 'test:Limit';

  function servicesWithLimit(size: number, max: number): IServiceManifest<'singleton'> {
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(LIMIT_TOKEN, { max });
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, () => ({ ...baseOptions(), retries: size })).as(
      'singleton',
    );
    return services;
  }

  test('a passing predicate resolves the options without throwing', () => {
    let services = servicesWithLimit(3, 10);
    services = services.validate<WidgetOptions, [{ max: number; }]>(
      OPTIONS_TOKEN,
      [LIMIT_TOKEN],
      (options, limit) => options.retries <= limit.max,
      'retries over limit',
    );

    const provider = services.build().createScope('singleton');

    expect(() => provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN)).not.toThrow();
  });

  test('a failing predicate surfaces the failure message', () => {
    let services = servicesWithLimit(50, 10);
    services = services.validate<WidgetOptions, [{ max: number; }]>(
      OPTIONS_TOKEN,
      [LIMIT_TOKEN],
      (options, limit) => options.retries <= limit.max,
      'retries over limit',
    );

    const provider = services.build().createScope('singleton');

    expect(() => provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN)).toThrow(OptionsValidationError);
    expect(() => provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN)).toThrow('retries over limit');
  });

  test('a failing predicate with no message uses the default', () => {
    let services = servicesWithLimit(50, 10);
    services = services.validate<WidgetOptions, [{ max: number; }]>(
      OPTIONS_TOKEN,
      [LIMIT_TOKEN],
      (options, limit) => options.retries <= limit.max,
    );

    const provider = services.build().createScope('singleton');

    expect(() => provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN)).toThrow('A validation error has occurred.');
  });
});
