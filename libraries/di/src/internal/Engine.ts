import { type Manifest, ManifestValidationError, type ServiceDescriptor, UnsatisfiableError, type ValidationFailure } from '@rhombus-std/di.core';
import { type IServiceProvider, memo, type Type } from '@rhombus-std/primitives';
import { CallSite } from './CallSite/index.js';
import { Registry } from './Registry.js';

export interface ResolveContext {
  /** What a service asking for the provider receives. */
  readonly serviceProvider: IServiceProvider;
  /** Registrations layered over the manifest for this walk only — a latebound call's arguments. */
  readonly additionalServices?: ReadonlyArray<ServiceDescriptor<unknown>>;
}

/**
 * The resolution orchestrator: one per manifest, stateless across resolutions — everything
 * per-walk arrives in the {@link ResolveContext}.
 */
export class Engine {
  readonly #manifest: Manifest<unknown>;
  readonly #registry: Registry;

  /**
   * The plan for a request, built once and kept for as long as this engine lives.
   *
   * @remarks
   * A plan is a pure function of the interned request and the fixed set of registrations — the
   * walk reads no runtime state — so the second ask for a type can only rebuild the same tree.
   * It holds no instances: it says how to construct, never what was constructed. A request that
   * cannot be satisfied caches nothing, so the failure is rebuilt and rethrown identically.
   */
  readonly #planFor = memo((serviceType: Type) => this.#build(serviceType, this.#registry));

  constructor(manifest: Manifest<unknown>) {
    this.#manifest = manifest;
    this.#registry = new Registry(manifest);
  }

  /** @throws {UnsatisfiableError} when nothing in the manifest can produce {@link serviceType}. */
  resolve(serviceType: Type, context: ResolveContext): unknown {
    // A latebound call's arguments are registrations for that walk alone, so its plan is not a
    // fact about this engine's manifest and is built fresh rather than kept.
    const site = context.additionalServices?.length
      ? this.#build(serviceType, new Registry(this.#manifest.addMany(context.additionalServices)))
      : this.#planFor(serviceType);
    return CallSite.realize(site, { engine: this, serviceProvider: context.serviceProvider, lifetimeModel: this.#manifest.lifetimeModel });
  }

  /** Whether {@link serviceType} can be built from this engine's manifest, without building it. */
  canResolve(serviceType: Type): boolean {
    try {
      this.#planFor(serviceType);
      return true;
    } catch (error) {
      if (error instanceof UnsatisfiableError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Builds a plan for every closed registration up front, collecting each failure instead of
   * stopping at the first, so one pass reports the whole broken graph.
   *
   * @throws {ManifestValidationError} when any registration has no plan.
   */
  validate(): void {
    const failures = Iterator.from(this.#registry.closedAddresses)
      .map(serviceType => this.#failure(serviceType))
      .filter((failure): failure is ValidationFailure => failure !== undefined)
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
  }

  #failure(serviceType: Type): ValidationFailure | undefined {
    try {
      this.#planFor(serviceType);
      return undefined;
    } catch (error) {
      return { serviceType, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  #build(serviceType: Type, registry: Registry): CallSite {
    const site = CallSite.from(serviceType, { registry });
    if (site === undefined) {
      throw new UnsatisfiableError(serviceType, 'nothing in the manifest can produce it');
    }
    return site;
  }
}
