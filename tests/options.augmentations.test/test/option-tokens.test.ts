// The public slot-token grammar: the derived slot token IS the open service
// contract for a token's pipeline (the reference's IConfigureOptions<T> /
// IOptionsChangeTokenSource<T> service-type analog), so a downstream package
// can append a step or source directly — no `configure(...)` call — and the
// assembly picks it up like any other.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceToken, ConfigChangeTokenSource, configureStepToken, postConfigureStepToken,
  validateStepToken } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  Url: string;
}

const TOKEN = 'test:WidgetOptions';

describe('the public slot-token grammar', () => {
  test('each helper derives the namespaced slot for the options token', () => {
    const namespace = '@rhombus-std/options.augmentations';
    expect(configureStepToken(TOKEN)).toBe(`${namespace}/configure/${TOKEN}`);
    expect(postConfigureStepToken(TOKEN)).toBe(`${namespace}/post-configure/${TOKEN}`);
    expect(validateStepToken(TOKEN)).toBe(`${namespace}/validate/${TOKEN}`);
    expect(changeTokenSourceToken(TOKEN)).toBe(`${namespace}/change-token-source/${TOKEN}`);
  });

  test("a directly-registered step and source join the token's assembly", () => {
    const config = new ConfigBuilder()
      .addInMemoryCollection({ 'Widget:Url': 'http://first' })
      .build() as unknown as IConfigRoot;

    let services = new ServiceManifest<'singleton'>();
    services = services.addOptions<WidgetOptions>(TOKEN, () => ({ Url: '' })).as('singleton');
    // What `configure(TOKEN, section)` does internally, spelled through the
    // public grammar: a custom configure step plus a bare change-token source.
    services = services.addValue(configureStepToken(TOKEN), {
      configure(options: WidgetOptions): void {
        options.Url = config.get('Widget:Url') ?? '';
      },
    });
    services = services.addValue(changeTokenSourceToken(TOKEN), new ConfigChangeTokenSource(config));

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(TOKEN);
    expect(options.value).toEqual({ Url: 'http://first' });

    const seen: WidgetOptions[] = [];
    options.subscribe!((value) => seen.push(value));
    config.set('Widget:Url', 'http://second');
    config.reload();

    expect(seen).toEqual([{ Url: 'http://second' }]);
  });
});
