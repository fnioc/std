import { type Manifest, ManifestValidationError, type ServiceDescriptor, UnsatisfiableError,
  type ValidationFailure } from '@rhombus-std/di.core';
import { type IServiceProvider, memo, type Type } from '@rhombus-std/primitives';
import { ServiceProviderOptions } from '../ServiceProviderOptions.js';
import { CallSite } from './CallSite/CallSite.js';
import { Registry } from './Registry.js';

export interface ResolveContext {
  /** What a service asking for the provider receives. */
  readonly serviceProvider: IServiceProvider;
  /** Registrations layered over the manifest for this walk only — a latebound call's arguments. */
  readonly additionalServices?: ReadonlyArray<ServiceDescriptor<string>>;
}

/**
 * The resolution orchestrator: one per manifest, stateless across resolutions — everything
 * per-walk arrives in the {@link ResolveContext}.
 */
export class Engine {
  readonly #manifest: Manifest;
  readonly #registry: Registry;
  readonly #unionAmbiguity: NonNullable<ServiceProviderOptions['unionAmbiguity']>;

  /**
   * The plan for a request, built once and kept for as long as this engine lives.
   *
   * @remarks
   * A plan is a pure function of the interned request and the fixed set of registrations — the
   * walk reads no runtime state — so the second ask for a type can only rebuild the same tree.
   * It holds no instances: it says how to construct, never what was constructed. A request that
   * cannot be satisfied caches nothing, so the failure is rebuilt and rethrown identically.
   */
  readonly #planFor = memo((type: Type) => this.#build(type, this.#registry));

  constructor(manifest: Manifest, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#manifest = manifest;
    this.#registry = new Registry(manifest);
    this.#unionAmbiguity = options.unionAmbiguity ?? 'error';
  }

  /** @throws {UnsatisfiableError} when nothing in the manifest can produce {@link type}. */
  resolve(type: Type, context: ResolveContext): unknown {
    // A latebound call's arguments are registrations for that walk alone, so its plan is not a
    // fact about this engine's manifest and is built fresh rather than kept.
    const site = context.additionalServices?.length
      ? this.#build(type, new Registry(this.#manifest.addMany(context.additionalServices)))
      : this.#planFor(type);
    return CallSite.realize(site, { engine: this, serviceProvider: context.serviceProvider });
  }

  /**
   * Builds a plan for every closed registration up front, collecting each failure instead of
   * stopping at the first, so one pass reports the whole broken graph.
   *
   * @throws {ManifestValidationError} when any registration has no plan.
   */
  validate(): void {
    const failures = Iterator.from(this.#registry.closedAddresses)
      .map(type => this.#failure(type))
      .filter((failure): failure is ValidationFailure => failure !== undefined)
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
  }

  #failure(type: Type): ValidationFailure | undefined {
    try {
      this.#planFor(type);
      return undefined;
    } catch (error) {
      return { type, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  #build(type: Type, registry: Registry): CallSite {
    const site = CallSite.from(type, { registry, unionAmbiguity: this.#unionAmbiguity });
    if (site === undefined) {
      throw new UnsatisfiableError(type, 'nothing in the manifest can produce it');
    }
    return site;
  }
}
