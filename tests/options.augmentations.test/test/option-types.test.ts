// The public slot-type grammar: the derived slot type IS the open service
// contract for a type's pipeline — `IConfigureOptions<T>`,
// `IOptionsChangeTokenSource<T>` and friends — so a downstream package can
// append a step or source directly — no `configure(...)` call — and the
// assembly picks it up like any other.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceType, ConfigChangeTokenSource, configureStepType, optionsAddressType, postConfigureStepType, validateStepType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  Url: string;
}

const WIDGET_OPTIONS_TYPE: Type = Type.from('test:WidgetOptions');

describe('the public slot-type grammar', () => {
  test('each helper composes the real contract type over the options type', () => {
    expect(configureStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.imported('IConfigureOptions', '@rhombus-std/options', [WIDGET_OPTIONS_TYPE]),
    );
    expect(postConfigureStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.imported('IPostConfigureOptions', '@rhombus-std/options', [WIDGET_OPTIONS_TYPE]),
    );
    expect(validateStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.imported('IValidateOptions', '@rhombus-std/options', [WIDGET_OPTIONS_TYPE]),
    );
    expect(changeTokenSourceType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.imported('IOptionsChangeTokenSource', '@rhombus-std/options.augmentations', [WIDGET_OPTIONS_TYPE]),
    );

    // The composition stringifies as a generic application over the imported
    // contract, so both sides of the slot round-trip through one spelling.
    expect(Type.stringify(configureStepType(WIDGET_OPTIONS_TYPE))).toBe(
      '@rhombus-std/options:IConfigureOptions<test:WidgetOptions>',
    );
  });

  test("a directly-registered step and source join the type's assembly", () => {
    const config = new ConfigBuilder().addInMemoryCollection({ 'Widget:Url': 'http://first' })
      .build() as unknown as IConfigRoot;

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
    // What `configure(WIDGET_OPTIONS_TYPE, section)` does internally, spelled
    // through the public grammar: a custom configure step plus a bare
    // change-token source.
    services = services.addValue(configureStepType(WIDGET_OPTIONS_TYPE), { configure(options: WidgetOptions): void {
      options.Url = config.get('Widget:Url') ?? '';
    } });
    services = services.addValue(changeTokenSourceType(WIDGET_OPTIONS_TYPE), new ConfigChangeTokenSource(config));

    const provider = services.build();
    const options: IOptions<WidgetOptions> = provider.getRequiredService(optionsAddressType(WIDGET_OPTIONS_TYPE));
    expect(options.value).toEqual({ Url: 'http://first' });

    const seen: WidgetOptions[] = [];
    options.subscribe!((value) => seen.push(value));
    config.set('Widget:Url', 'http://second');
    config.reload();

    expect(seen).toEqual([{ Url: 'http://second' }]);
  });
});
