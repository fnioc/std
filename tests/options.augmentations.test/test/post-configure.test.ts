// The bare (non-DI-injected) postConfigure form, exercised end-to-end through
// the public manifest augmentation: `postConfigure(token, delegate)` and
// `postConfigure(token, IPostConfigureOptions-object)`. Both append to the
// token's post-configure slot, which the assembly runs AFTER every configure
// step -- so each case registers a configure step first and asserts the
// post-configure observed (and built on) the configured value. The
// DI-injected form is covered in di-injected-steps.test.ts; this closes the
// bare form, which was implemented but had no manifest-surface caller (#128).

import { ServiceManifest } from '@rhombus-std/di';
import type { IOptions, IPostConfigureOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  suffix: string;
}

const OPTIONS_TOKEN = 'test:WidgetOptions';

describe('postConfigure — bare form', () => {
  test('a plain delegate runs after configure, seeing the configured value', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, () => ({ suffix: '' })).as('singleton');
    services = services.configure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.suffix = 'base';
    });
    services = services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.suffix += '!';
    });

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    // 'base!' proves ordering: the post-configure ran after the configure and
    // appended to its result, not before it.
    expect(options.value.suffix).toBe('base!');
  });

  test('a pre-built IPostConfigureOptions object runs after configure', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, () => ({ suffix: '' })).as('singleton');
    services = services.configure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.suffix = 'base';
    });
    const step: IPostConfigureOptions<WidgetOptions> = {
      postConfigure(options) {
        options.suffix += '!';
      },
    };
    services = services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, step);

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value.suffix).toBe('base!');
  });

  test('every registered post-configure step runs, in registration order', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<WidgetOptions>(OPTIONS_TOKEN, () => ({ suffix: 'base' })).as('singleton');
    services = services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
      options.suffix += '-a';
    });
    services = services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, {
      postConfigure(options) {
        options.suffix += '-b';
      },
    });

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(OPTIONS_TOKEN);

    expect(options.value.suffix).toBe('base-a-b');
  });
});
