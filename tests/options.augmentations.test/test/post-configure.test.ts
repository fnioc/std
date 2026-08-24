// The bare (non-DI-injected) postConfigure form, exercised end-to-end through
// the public manifest augmentation: `postConfigure(optionsType, delegate)` and
// `postConfigure(optionsType, IPostConfigureOptions-object)`. Both append to the
// type's post-configure slot, which the assembly runs AFTER every configure
// step -- so each case registers a configure step first and asserts the
// post-configure observed (and built on) the configured value. The
// DI-injected form is covered in di-injected-steps.test.ts; this closes the
// bare form, which was implemented but had no manifest-surface caller (#128).

import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions, IPostConfigureOptions } from '@rhombus-std/options';
import { optionsAddressType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  suffix: string;
}

const OPTIONS_TYPE: Type = Type.from('test:WidgetOptions');

describe('postConfigure — bare form', () => {
  test('a plain delegate runs after configure, seeing the configured value', () => {
    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ suffix: '' }));
    services = services.configure(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.suffix = 'base';
    });
    services = services.postConfigure(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.suffix += '!';
    });

    const provider = services.build();
    const options: IOptions<WidgetOptions> = provider.getService(optionsAddressType(OPTIONS_TYPE));

    // 'base!' proves ordering: the post-configure ran after the configure and
    // appended to its result, not before it.
    expect(options.value.suffix).toBe('base!');
  });

  test('a pre-built IPostConfigureOptions object runs after configure', () => {
    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ suffix: '' }));
    services = services.configure(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.suffix = 'base';
    });
    const step: IPostConfigureOptions<WidgetOptions> = { postConfigure(options) {
      options.suffix += '!';
    } };
    services = services.postConfigure(OPTIONS_TYPE, step);

    const provider = services.build();
    const options: IOptions<WidgetOptions> = provider.getService(optionsAddressType(OPTIONS_TYPE));

    expect(options.value.suffix).toBe('base!');
  });

  test('every registered post-configure step runs, in registration order', () => {
    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions(OPTIONS_TYPE, () => ({ suffix: 'base' }));
    services = services.postConfigure(OPTIONS_TYPE, (options: WidgetOptions) => {
      options.suffix += '-a';
    });
    services = services.postConfigure(OPTIONS_TYPE, { postConfigure(options: WidgetOptions) {
      options.suffix += '-b';
    } });

    const provider = services.build();
    const options: IOptions<WidgetOptions> = provider.getService(optionsAddressType(OPTIONS_TYPE));

    expect(options.value.suffix).toBe('base-a-b');
  });
});
