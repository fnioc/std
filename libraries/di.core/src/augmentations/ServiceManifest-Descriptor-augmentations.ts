// Descriptor-level mutation verbs on the registration builder: `removeAll`, the
// conditional `tryAdd*` family, and the unconditional `replace*` family.
//
// EVERY verb here returns a NEW manifest -- the manifest is immutable, so a
// discarded result is a silent no-op. Callers thread it:
// `services = services.removeAll(token)`. `tryAdd*` on an already-registered token
// hands the receiver back UNCHANGED, which under an immutable manifest IS the
// no-op: the caller keeps whatever came back either way.
//
// KEYED verbs probe the EFFECTIVE token. A keyed registration lands under
// `base#key` (`keyedToken`), so the `tryAdd*` dedup probe and the `replace*`
// removal have to name that same composed token -- probing the bare base instead
// would drop a keyed add whenever the UNKEYED token happened to be registered,
// and a keyed replace would delete the unkeyed registrations while merely
// appending a second keyed one.
//
// The class/factory verbs take `signatures`, then optional `scope`, then optional
// `key` POSITIONALLY rather than returning an `AddChain`: the already-registered
// branch has no pending registration to hand a modifier face for, so both branches
// share the plain `IServiceManifest` return.
//
// There is deliberately NO lifetime-named verb (`tryAddSingleton` and friends): a
// lifetime here is an arbitrary NAMED scope, passed as an argument or set through
// `.as(scope)`, exactly as on `addClass` -- and the scope names a given manifest
// declares need not include "singleton" or "scoped" at all.
//
// DEFERRED -- dedup by (service, implementation) rather than by token: a
// `Registration` collapses a class into an opaque `produce` closure and keeps only
// a diagnostic `name`, so implementation identity is not recoverable
// post-registration. It needs an identity field threaded through the add path, and
// has no consumer yet.

import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

// `keyedToken` is the one place the `base#key` grammar is spelled; the verbs
// below share it with the add path so a probe and the registration it guards can
// never disagree. `ServiceManifestClass` is the receiver because `removeAll` and
// the dedup probe read `removeRegistrations` / `hasRegistrations`, which the
// public authoring interface deliberately does not carry.
import { type IServiceManifest, keyedToken, type ServiceManifestClass } from '../IServiceManifest.js';
import type { DepSignatures, Token } from '../types.js';

type IServiceManifestDescriptorAugmentations<Scopes extends string> = {
  /**
   * Returns a manifest with every registration bound to `token` — exact and
   * open — dropped. The receiver is unchanged; keep the result.
   */
  removeAll(token: Token): IServiceManifest<Scopes>;
  /**
   * Class registration, but only when `token` has NO registration yet.
   * Positional `scope` / `key` exactly as on `addClass`. When the token was
   * already registered the receiver is returned UNCHANGED.
   */
  tryAdd(token: Token, ctor: Ctor, signatures: DepSignatures, scope?: Scopes, key?: string): IServiceManifest<Scopes>;
  /**
   * Factory registration, but only when `token` has NO registration yet. Same
   * no-op-returns-the-receiver rule.
   */
  tryAddFactory(token: Token, factory: Func<any[], unknown>, signatures: DepSignatures, scope?: Scopes,
    key?: string): IServiceManifest<Scopes>;
  /**
   * Value registration, but only when `token` has NO registration yet. A value
   * takes no signatures and no lifetime, exactly like `addValue`.
   */
  tryAddValue(token: Token, value: unknown, key?: string): IServiceManifest<Scopes>;
  /** Drops the token's existing registrations, then registers `ctor` anew. */
  replace(token: Token, ctor: Ctor, signatures: DepSignatures, scope?: Scopes, key?: string): IServiceManifest<Scopes>;
  /**
   * Drops the token's existing registrations, then registers a factory anew.
   * The factory-shaped sibling of `replace`.
   */
  replaceFactory(token: Token, factory: Func<any[], unknown>, signatures: DepSignatures, scope?: Scopes,
    key?: string): IServiceManifest<Scopes>;
  /** Drops the token's existing registrations, then registers a value anew. */
  replaceValue(token: Token, value: unknown, key?: string): IServiceManifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the verbs do not name it.
// `ServiceManifestClass` picks the verbs up through its own interface merge, so
// it needs no second block here.
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown>
    extends IServiceManifestDescriptorAugmentations<Scopes> {}
}

// `addClass`/`addFactory` are OVERLOADED on arity and each arm returns a
// differently-gated `AddChain`, so a forwarder holding `scope`/`key` as OPTIONAL
// locals cannot spread them through in one call -- it has to pick the arm that
// matches what it actually got. These two dispatchers are that pick, shared by
// the `tryAdd*` and `replace*` pairs. They always pass `signatures` positionally,
// so the manifest they hand back is ungated.
//
// A `key` with no `scope` has no arm of its own: the widest one requires a scope
// before the key, while the registration the body builds carries the two
// independently. Passing `scope` through as-is registers at the default scope,
// exactly as the three-argument arm does.
function addClassTo(manifest: IServiceManifest<string>, token: Token, ctor: Ctor, signatures: DepSignatures,
  scope?: string, key?: string): IServiceManifest<string> {
  if (key !== undefined) {
    return manifest.addClass(token, ctor, signatures, scope as string, key);
  }
  if (scope === undefined) {
    return manifest.addClass(token, ctor, signatures);
  }
  return manifest.addClass(token, ctor, signatures, scope);
}

function addFactoryTo(manifest: IServiceManifest<string>, token: Token, factory: Func<any[], unknown>,
  signatures: DepSignatures, scope?: string, key?: string): IServiceManifest<string> {
  if (key !== undefined) {
    return manifest.addFactory(token, factory, signatures, scope as string, key);
  }
  if (scope === undefined) {
    return manifest.addFactory(token, factory, signatures);
  }
  return manifest.addFactory(token, factory, signatures, scope);
}

// The exported const IS the standalone call surface; registering it installs the
// same members as fluent prototype methods.
export const ServiceManifestDescriptorAugmentations: AugmentationSet2<ServiceManifestClass<string>,
  IServiceManifestDescriptorAugmentations<string>> = {
    removeAll(manifest, token) {
      return manifest.removeRegistrations(token);
    },

    tryAdd(manifest, token, ctor, signatures, scope, key) {
      if (manifest.hasRegistrations(keyedToken(token, key))) {
        return manifest;
      }
      return addClassTo(manifest, token, ctor, signatures, scope, key);
    },

    tryAddFactory(manifest, token, factory, signatures, scope, key) {
      if (manifest.hasRegistrations(keyedToken(token, key))) {
        return manifest;
      }
      return addFactoryTo(manifest, token, factory, signatures, scope, key);
    },

    tryAddValue(manifest, token, value, key) {
      if (manifest.hasRegistrations(keyedToken(token, key))) {
        return manifest;
      }
      return key === undefined ? manifest.addValue(token, value) : manifest.addValue(token, value, key);
    },

    replace(manifest, token, ctor, signatures, scope, key) {
      return addClassTo(manifest.removeRegistrations(keyedToken(token, key)), token, ctor, signatures, scope, key);
    },

    replaceFactory(manifest, token, factory, signatures, scope, key) {
      return addFactoryTo(manifest.removeRegistrations(keyedToken(token, key)), token, factory, signatures, scope, key);
    },

    replaceValue(manifest, token, value, key) {
      const kept = manifest.removeRegistrations(keyedToken(token, key));
      return key === undefined ? kept.addValue(token, value) : kept.addValue(token, value, key);
    },
  };

registerAugmentations(tokenfor<IServiceManifest>(), ServiceManifestDescriptorAugmentations);
