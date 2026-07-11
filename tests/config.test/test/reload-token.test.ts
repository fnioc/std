// getReloadToken() / reload-on-change -- docs/decisions.md's settled
// Live-reload (#6) decision: a single-fire IChangeToken per provider, a root
// that composes provider tokens into its own, and sections that delegate to
// their root. No OS file-watching lives here (out of v0 scope) -- every fire
// below is either root.reload() or a provider explicitly reporting a refresh.

import { ConfigurationBuilder, ConfigurationProvider, type IConfigurationRoot } from '@rhombus-std/config';
import { ChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';
import { rootOf } from './support';

/** A provider whose `refresh()` mimics a source-driven data change: it writes
 * a key, then reports the refresh via the protected `onReload` hook every
 * concrete provider (json/env/cli) also calls once its data has actually
 * changed. */
class RefreshableProvider extends ConfigurationProvider {
  public refresh(key: string, value: string): void {
    this.set(key, value);
    this.onReload();
  }
}

function rootOfRefreshable(): { root: IConfigurationRoot; provider: RefreshableProvider; } {
  const provider = new RefreshableProvider();
  // ConfigurationBuilder has no add(provider) sugar -- a source that just
  // hands back the pre-built provider mirrors how a real
  // IConfigurationSource.build() works.
  const source = { build: () => provider };
  const root = new ConfigurationBuilder().add(source).build() as unknown as IConfigurationRoot;
  return { root, provider };
}

describe('ConfigurationProvider.getReloadToken', () => {
  test('hasChanged flips only after onReload runs', () => {
    const provider = new RefreshableProvider();
    const before = provider.getReloadToken();
    expect(before.hasChanged).toBe(false);

    provider.refresh('Key', 'value');

    expect(before.hasChanged).toBe(true);
    // A fresh token is swapped in for the next fire.
    expect(provider.getReloadToken()).not.toBe(before);
    expect(provider.getReloadToken().hasChanged).toBe(false);
  });

  test('registerChangeCallback fires exactly once per refresh', () => {
    const provider = new RefreshableProvider();
    let fires = 0;
    provider.getReloadToken().registerChangeCallback(() => {
      fires++;
    });

    provider.refresh('Key', 'value');

    expect(fires).toBe(1);
  });
});

describe('ConfigurationRoot.getReloadToken', () => {
  test("root.reload() fires the root's token exactly once", () => {
    const root = rootOf({ 'Server:Port': '8080' });
    let fires = 0;
    ChangeToken.onChange(() => root.getReloadToken(), () => {
      fires++;
    });

    root.reload();

    expect(fires).toBe(1);
  });

  test('ChangeToken.onChange keeps observing across multiple reloads', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    const seen: number[] = [];
    ChangeToken.onChange(() => root.getReloadToken(), () => {
      seen.push(seen.length);
    });

    root.reload();
    root.reload();
    root.reload();

    expect(seen).toEqual([0, 1, 2]);
  });

  test("a provider-driven refresh (not just root.reload()) raises the root's own token", () => {
    const { root, provider } = rootOfRefreshable();
    let fires = 0;
    ChangeToken.onChange(() => root.getReloadToken(), () => {
      fires++;
    });

    provider.refresh('Key', 'value');

    expect(fires).toBe(1);
    expect(root.get('Key')).toBe('value');
  });
});

describe('ConfigurationSection.getReloadToken', () => {
  test('delegates to the owning root -- a section has no reload state of its own', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    const section = root.getSection('Server');

    expect(section.getReloadToken()).toBe(root.getReloadToken());

    root.reload();

    expect(section.getReloadToken()).toBe(root.getReloadToken());
  });
});
