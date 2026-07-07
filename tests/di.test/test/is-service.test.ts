import { ServiceManifest } from "@rhombus-std/di";
import { expect, test } from "bun:test";
import { defineDeps, G, OneDep, T, ZeroArg } from "./fixtures.js";

// isService(token) — the token-based registration predicate (#23), mirroring the
// reference DI's IServiceProviderIsService.IsService. A pure probe: it reports
// whether a token WOULD resolve, without attempting construction.

test("isService is true for a registered token, false for an unregistered one", () => {
  const services = new ServiceManifest<"singleton">();
  services.add(T.Service, ZeroArg);
  const provider = services.build();

  expect(provider.isService(T.Service)).toBe(true);
  expect(provider.isService(T.Logger)).toBe(false);
});

test("isService is true for a registered token even when its dependency is unregistered", () => {
  // The probe never constructs — a service with a missing dependency IS still a
  // registered service. (resolve would throw; isService reports true.)
  const services = new ServiceManifest<"singleton">();
  defineDeps(OneDep, [[T.Db]]);
  services.add(T.Service, OneDep);
  const provider = services.build();

  expect(provider.isService(T.Service)).toBe(true);
  expect(provider.isService(T.Db)).toBe(false);
});

test("isService closes an open-generic template — true for a resolvable closing", () => {
  const services = new ServiceManifest<"singleton">();
  services.add(G.RepoTemplate, ZeroArg);
  const provider = services.build();

  expect(provider.isService(G.RepoOfA)).toBe(true);
  // A different base with no registration stays false.
  expect(provider.isService(T.Repo)).toBe(false);
});
