import { NoSatisfiableSignatureError, ServiceManifest, UnregisteredTokenError } from '@rhombus-std/di';
import { expect, test } from 'bun:test';
import { defineDeps, OneDep, T, ZeroArg } from './fixtures.js';

// tryResolve<T>() — the non-throwing counterpart to resolve<T>() (#25). Returns
// the instance for a registered token, `undefined` for an unregistered one, and
// re-throws for a REGISTERED token whose construction fails for another reason.

test('tryResolve returns the resolved instance for a registered token', () => {
  let services = new ServiceManifest<'singleton'>();
  services = services.addClass(T.Service, ZeroArg, [[]]);
  const provider = services.build();

  const instance = provider.tryResolve<ZeroArg>(T.Service);
  expect(instance).toBeInstanceOf(ZeroArg);
  expect(instance?.tag).toBe('zero');
});

test('tryResolve returns undefined for an unregistered token (no throw)', () => {
  const services = new ServiceManifest<'singleton'>();
  const provider = services.build();

  expect(provider.tryResolve(T.Service)).toBeUndefined();
  // The throwing counterpart still throws for the same miss.
  expect(() => provider.resolve(T.Service)).toThrow(UnregisteredTokenError);
});

test("tryResolve re-throws when a REGISTERED token's dependency is unregistered", () => {
  // OneDep is registered but its sole dependency (T.Db) is not — a construction
  // failure, not a registration miss. tryResolve softens only the top-level miss.
  let services = new ServiceManifest<'singleton'>();
  defineDeps(OneDep, [[T.Db]]);
  services = services.addClass(T.Service, OneDep, [[T.Db]]);
  const provider = services.build();

  // The token IS registered — tryResolve does not soften it to undefined. Its
  // unsatisfiable dependency surfaces as the ordinary construction error.
  expect(() => provider.tryResolve(T.Service)).toThrow(NoSatisfiableSignatureError);
});

test('tryResolve without a token throws the transformer-plugin hint', () => {
  const services = new ServiceManifest<'singleton'>();
  const provider = services.build();

  expect(() => (provider as { tryResolve: () => unknown; }).tryResolve()).toThrow(
    /requires the @rhombus-std\/di\.transformer plugin/,
  );
});
