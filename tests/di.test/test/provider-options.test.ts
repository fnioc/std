import {
  CircularDependencyError,
  FactoryTargetError,
  MissingMetadataError,
  NoSatisfiableSignatureError,
  RegistrationValidationError,
  ScopeValidationError,
  ServiceManifest,
} from "@rhombus-std/di";
import { describe, expect, test } from "bun:test";
import { defineDeps, G, T } from "./fixtures.js";

// ServiceProviderOptions — the reference `ServiceProviderOptions` analog:
// `validateScopes` (resolution-time scope-ownership validation) and
// `validateOnBuild` (eager all-registrations dry-run validation, failures
// aggregated). Both default OFF — `build()` with no options keeps the silent
// tagged-with-no-open-frame ⇒ transient fallback.
//
// NOTE: `defineDeps` stashes signatures per-CTOR in a module-level WeakMap and
// APPENDS on repeat calls, so every test defines its own local classes.

class Leaf {
  public readonly tag = "leaf";
}

describe("validateScopes — resolution-time scope validation", () => {
  test("OFF by default: a tagged registration with no open frame still resolves transiently", () => {
    const services = new ServiceManifest<"singleton">();
    services.add(T.Service, Leaf).as("singleton");

    const provider = services.build(); // frameless, no options
    expect(provider.resolve(T.Service)).not.toBe(provider.resolve(T.Service));
  });

  test("DIRECT flavor: resolving a tagged service with no matching frame open throws", () => {
    const services = new ServiceManifest<"singleton">();
    services.add(T.Service, Leaf).as("singleton");

    const provider = services.build({ validateScopes: true }); // frameless
    expect(() => provider.resolve(T.Service)).toThrow(ScopeValidationError);

    try {
      provider.resolve(T.Service);
      throw new Error("unreachable");
    } catch (err) {
      const e = err as ScopeValidationError;
      expect(e).toBeInstanceOf(ScopeValidationError);
      expect(e.token).toBe(T.Service);
      expect(e.scope).toBe("singleton");
      expect(e.consumer).toBeUndefined();
      expect(e.message).toContain(`Cannot resolve "singleton"-scoped service`);
    }
  });

  test("a matching open frame satisfies the check — resolves and caches normally", () => {
    const services = new ServiceManifest<"singleton">();
    services.add(T.Service, Leaf).as("singleton");

    const root = services.build({ validateScopes: true }).createScope("singleton");
    expect(root.resolve(T.Service)).toBe(root.resolve(T.Service));
  });

  test("INDIRECT flavor: a transient chain reaching a tagged dep names the requested token", () => {
    class TransientConsumer {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton" | "request">();
    defineDeps(TransientConsumer, [[T.Service]]);
    services.add(T.Service, Leaf).as("request");
    services.add(T.Repo, TransientConsumer); // untagged (transient) consumer

    const provider = services.build({ validateScopes: true }); // frameless
    try {
      provider.resolve(T.Repo);
      throw new Error("unreachable");
    } catch (err) {
      const e = err as ScopeValidationError;
      expect(e).toBeInstanceOf(ScopeValidationError);
      expect(e.token).toBe(T.Service);
      expect(e.scope).toBe("request");
      expect(e.consumer).toBeUndefined();
      expect(e.requested).toBe(T.Repo);
      expect(e.message).toContain(`Cannot resolve "${T.Repo}"`);
      expect(e.message).toContain(`requires "request"-scoped service`);
    }
  });

  test("CAPTIVE flavor: an owned consumer's tagged dep with no frame in the OWNING chain names the consumer", () => {
    // singleton frame open, request child open. The singleton-owned consumer
    // constructs relative to its OWNER frame (the critical rule), whose chain
    // has no request frame — without validation the dep would silently be a
    // fresh transient captured for the singleton's whole lifetime.
    class CaptiveHolder {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton" | "request">();
    defineDeps(CaptiveHolder, [[T.Service]]);
    services.add(T.Service, Leaf).as("request");
    services.add(T.Repo, CaptiveHolder).as("singleton");

    const root = services.build({ validateScopes: true }).createScope("singleton");
    const req = root.createScope("request");

    try {
      req.resolve(T.Repo);
      throw new Error("unreachable");
    } catch (err) {
      const e = err as ScopeValidationError;
      expect(e).toBeInstanceOf(ScopeValidationError);
      expect(e.token).toBe(T.Service);
      expect(e.scope).toBe("request");
      expect(e.consumer).toEqual({ token: T.Repo, scope: "singleton" });
      expect(e.message).toContain(`Cannot consume "request"-scoped service`);
      expect(e.message).toContain(`from "singleton"-owned "${T.Repo}"`);
    }
  });

  test("no violation: an owned consumer whose tagged dep's frame IS an ancestor resolves fine", () => {
    // The inverse nesting — a request-owned consumer with a singleton dep —
    // is legitimate: the dep outlives the consumer.
    class RequestHolder {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton" | "request">();
    defineDeps(RequestHolder, [[T.Service]]);
    services.add(T.Service, Leaf).as("singleton");
    services.add(T.Repo, RequestHolder).as("request");

    const root = services.build({ validateScopes: true }).createScope("singleton");
    const req = root.createScope("request");

    const repo = req.resolve<RequestHolder>(T.Repo);
    expect(repo.dep).toBeInstanceOf(Leaf);
    expect(repo.dep).toBe(root.resolve(T.Service)); // shared singleton
  });

  test("tryResolve does NOT soften a scope violation — the token IS registered", () => {
    const services = new ServiceManifest<"singleton">();
    services.add(T.Service, Leaf).as("singleton");

    const provider = services.build({ validateScopes: true });
    expect(() => provider.tryResolve(T.Service)).toThrow(ScopeValidationError);
  });

  test("collection elements are validated per element registration", () => {
    const services = new ServiceManifest<"singleton">();
    services.add(T.Service, Leaf); // untagged — fine anywhere
    services.add(T.Service, Leaf).as("singleton"); // tagged — violates framelessly

    const provider = services.build({ validateScopes: true });
    expect(() => provider.resolve(`Array<${T.Service}>`)).toThrow(ScopeValidationError);
  });
});

describe("validateOnBuild — eager all-registrations validation", () => {
  test("a valid graph builds and the provider works", () => {
    class ValidConsumer {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton">();
    defineDeps(ValidConsumer, [[T.Service]]);
    services.add(T.Service, Leaf).as("singleton");
    services.add(T.Repo, ValidConsumer);

    const root = services.build({ validateOnBuild: true }).createScope("singleton");
    expect(root.resolve<ValidConsumer>(T.Repo).dep).toBeInstanceOf(Leaf);
  });

  test("a missing dependency fails the build with an aggregated, wrapped error", () => {
    class NeedsMissing {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(NeedsMissing, [[T.Service]]); // T.Service never registered
    const services = new ServiceManifest<"singleton">();
    services.add(T.Repo, NeedsMissing);

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect(aggregate).toBeInstanceOf(AggregateError);
      expect(aggregate.message).toBe("Some services are not able to be constructed");
      expect(aggregate.errors).toHaveLength(1);
      const wrapped = aggregate.errors[0] as RegistrationValidationError;
      expect(wrapped).toBeInstanceOf(RegistrationValidationError);
      expect(wrapped.token).toBe(T.Repo);
      expect(wrapped.message).toContain(`validating the registration for "${T.Repo}"`);
      expect(wrapped.cause).toBeInstanceOf(NoSatisfiableSignatureError);
    }
  });

  test("without validateOnBuild the same broken graph builds silently (fails at resolve)", () => {
    class NeedsMissingLazy {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(NeedsMissingLazy, [[T.Service]]);
    const services = new ServiceManifest<"singleton">();
    services.add(T.Repo, NeedsMissingLazy);

    const provider = services.build(); // no eager validation
    expect(() => provider.resolve(T.Repo)).toThrow(NoSatisfiableSignatureError);
  });

  test("an un-annotated ctor with parameters is reported (MissingMetadataError)", () => {
    class Unannotated {
      public constructor(public readonly a: unknown) {}
    }
    const services = new ServiceManifest<"singleton">();
    services.add(T.A, Unannotated); // arity 1, no signatures

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect((aggregate.errors[0] as RegistrationValidationError).cause).toBeInstanceOf(
        MissingMetadataError,
      );
    }
  });

  test("a dependency cycle is reported for every registration on the cycle", () => {
    class CycleA {
      public constructor(public readonly dep: unknown) {}
    }
    class CycleB {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(CycleA, [[T.B]]);
    defineDeps(CycleB, [[T.A]]);
    const services = new ServiceManifest<"singleton">();
    services.add(T.A, CycleA);
    services.add(T.B, CycleB);

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect(aggregate.errors).toHaveLength(2);
      for (const wrapped of aggregate.errors as RegistrationValidationError[]) {
        expect(wrapped.cause).toBeInstanceOf(CircularDependencyError);
      }
    }
  });

  test("every broken registration is reported at once, not just the first", () => {
    class BrokenOne {
      public constructor(public readonly dep: unknown) {}
    }
    class BrokenTwo {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(BrokenOne, [[T.Service]]); // missing
    defineDeps(BrokenTwo, [[T.Config]]); // missing too
    const services = new ServiceManifest<"singleton">();
    services.add(T.A, BrokenOne);
    services.add(T.B, BrokenTwo);

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect(aggregate.errors).toHaveLength(2);
      const tokens = (aggregate.errors as RegistrationValidationError[]).map((e) => e.token);
      expect(tokens).toEqual([T.A, T.B]);
    }
  });

  test("an unregistered factory-injection target is reported (FactoryTargetError)", () => {
    class NeedsFactory {
      public constructor(public readonly make: unknown) {}
    }
    defineDeps(NeedsFactory, [[{ type: T.Service }]]); // () => IService param
    const services = new ServiceManifest<"singleton">();
    services.add(T.Repo, NeedsFactory);

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect((aggregate.errors[0] as RegistrationValidationError).cause).toBeInstanceOf(
        FactoryTargetError,
      );
    }
  });

  test("OPEN-template registrations are not validated (no closed args to substitute)", () => {
    // The open template's dep is unregistered — but open registrations are
    // skipped, mirroring the reference's un-validated open generics.
    class OpenImpl {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton">();
    services.add(G.RepoTemplate, OpenImpl, [[T.Config]]);

    expect(() => services.build({ validateOnBuild: true })).not.toThrow();
  });

  test("...but a closing SYNTHESIZED as an exact registration's dep IS validated", () => {
    class OpenImplNeedsMissing {
      public constructor(public readonly dep: unknown) {}
    }
    class ClosingConsumer {
      public constructor(public readonly repo: unknown) {}
    }
    defineDeps(ClosingConsumer, [[G.RepoOfA]]);
    const services = new ServiceManifest<"singleton">();
    services.add(G.RepoTemplate, OpenImplNeedsMissing, [[T.Config]]); // T.Config missing
    services.add(T.B, ClosingConsumer);

    try {
      services.build({ validateOnBuild: true });
      throw new Error("unreachable");
    } catch (err) {
      const aggregate = err as AggregateError;
      expect(aggregate.errors).toHaveLength(1);
      expect((aggregate.errors[0] as RegistrationValidationError).token).toBe(T.B);
    }
  });

  test("scope nesting is NOT statically validated — frames are dynamic, so it stays a resolve-time check", () => {
    // A "request"-tagged dep under a "singleton"-tagged consumer is only a
    // violation for a particular arrangement of OPEN frames, unknowable at
    // build time in the uniform-named-frame model (unlike the reference's
    // fixed singleton/scoped ordering). validateOnBuild accepts the graph;
    // validateScopes rejects the bad arrangement when it actually occurs.
    class DynamicHolder {
      public constructor(public readonly dep: unknown) {}
    }
    const services = new ServiceManifest<"singleton" | "request">();
    defineDeps(DynamicHolder, [[T.Service]]);
    services.add(T.Service, Leaf).as("request");
    services.add(T.Repo, DynamicHolder).as("singleton");

    const provider = services.build({ validateOnBuild: true, validateScopes: true });
    const root = provider.createScope("singleton");
    expect(() => root.resolve(T.Repo)).toThrow(ScopeValidationError);
  });
});
