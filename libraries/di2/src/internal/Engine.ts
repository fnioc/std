import { IManifest, ManifestValidationError, ServiceDescriptor, UnsatisfiableError,
  type ValidationFailure } from '@rhombus-std/di2.core';
import type { IServiceProvider, Type } from '@rhombus-std/primitives';
import { CallSite } from './CallSite/CallSite.js';
import { isOpenType } from './OpenTypeVisitor.js';

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
  readonly #manifest: IManifest;

  constructor(manifest: IManifest) {
    this.#manifest = manifest;
  }

  /** @throws {UnsatisfiableError} when nothing in the manifest can produce {@link type}. */
  resolve(type: Type, context: ResolveContext): unknown {
    const manifest = this.#manifest.addMany(context.additionalServices ?? []);
    // const manifest = context.additionalServices
    //   ? context.additionalServices.reduce<IManifest>((layered, descriptor) => layered.add(descriptor), this.#manifest)
    //   : this.#manifest;
    const site = this.#lower(type, manifest);
    return CallSite.realize(site, { engine: this, serviceProvider: context.serviceProvider });
  }

  /**
   * Lowers every closed registration up front, collecting each failure instead of stopping at
   * the first, so one pass reports the whole broken graph.
   *
   * @throws {ManifestValidationError} when any registration cannot be lowered.
   */
  validate(): void {
    const failures = Iterator.from(this.#manifest)
      .filter(descriptor => !isOpenType(descriptor.serviceType))
      .map(descriptor => this.#failure(descriptor.serviceType))
      .filter((failure): failure is ValidationFailure => failure !== undefined)
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
  }

  #failure(type: Type): ValidationFailure | undefined {
    try {
      this.#lower(type, this.#manifest);
      return undefined;
    } catch (error) {
      return { type, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  #lower(type: Type, manifest: IManifest): CallSite {
    const site = CallSite.from(type, { manifest });
    if (site === undefined) {
      throw new UnsatisfiableError(type, 'nothing in the manifest can produce it');
    }
    return site;
  }
}
