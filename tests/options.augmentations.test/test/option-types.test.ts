// The public slot-type grammar: the derived slot type IS the open service
// contract for a type's pipeline (the `IConfigureOptions<T>` /
// `IOptionsChangeTokenSource<T>` service-type analog), so a downstream package
// can append a step or source directly — no `configure(...)` call — and the
// assembly picks it up like any other.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceType, ConfigChangeTokenSource, configureStepType, postConfigureStepType,
  validateStepType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  Url: string;
}

const WIDGET_OPTIONS_TYPE: Type = Type.from('test:WidgetOptions');

describe('the public slot-type grammar', () => {
  test('each helper derives the namespaced slot type for the options type', () => {
    const namespace = '@rhombus-std/options.augmentations';
    expect(configureStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.named(`${namespace}/configure`, 'global', [WIDGET_OPTIONS_TYPE]),
    );
    expect(postConfigureStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.named(`${namespace}/post-configure`, 'global', [WIDGET_OPTIONS_TYPE]),
    );
    expect(validateStepType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.named(`${namespace}/validate`, 'global', [WIDGET_OPTIONS_TYPE]),
    );
    expect(changeTokenSourceType(WIDGET_OPTIONS_TYPE)).toBe(
      Type.named(`${namespace}/change-token-source`, 'global', [WIDGET_OPTIONS_TYPE]),
    );

    // The structural composition stringifies as a generic application, not a
    // path — a `<`-delimited nesting a plain string could never round-trip.
    expect(Type.stringify(configureStepType(WIDGET_OPTIONS_TYPE))).toBe(
      `${namespace}/configure<test:WidgetOptions>`,
    );
  });

  test("a directly-registered step and source join the type's assembly", () => {
    const config = new ConfigBuilder().addInMemoryCollection({ 'Widget:Url': 'http://first' })
      .build() as unknown as IConfigRoot;

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions<WidgetOptions>(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
    // What `configure(WIDGET_OPTIONS_TYPE, section)` does internally, spelled
    // through the public grammar: a custom configure step plus a bare
    // change-token source.
    services = services.addValue(configureStepType(WIDGET_OPTIONS_TYPE), { configure(options: WidgetOptions): void {
      options.Url = config.get('Widget:Url') ?? '';
    } });
    services = services.addValue(changeTokenSourceType(WIDGET_OPTIONS_TYPE), new ConfigChangeTokenSource(config));

    const provider = services.build().createScope('singleton');
    const options: IOptions<WidgetOptions> = provider.getRequiredService(WIDGET_OPTIONS_TYPE);
    expect(options.value).toEqual({ Url: 'http://first' });

    const seen: WidgetOptions[] = [];
    options.subscribe!((value) => seen.push(value));
    config.set('Widget:Url', 'http://second');
    config.reload();

    expect(seen).toEqual([{ Url: 'http://second' }]);
  });
});
