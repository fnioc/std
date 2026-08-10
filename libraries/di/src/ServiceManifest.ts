// The constructible public `ServiceManifest` value, paired with the authoring
// interface of the same name.

import { type IServiceManifest as ServiceManifestInterface, ServiceManifestClass } from '@rhombus-std/di.core';

// Side-effect import: installs the real `build()` onto the class's prototype, so
// `new ServiceManifest().build()` produces a live provider.
import './ServiceManifest-ContainerBuilder-augmentations.js';

/**
 * The public authoring INTERFACE a `@rhombus-std/di` consumer holds — di.core's
 * `ServiceManifest<S>`, re-declared locally so it merges with the constructible
 * VALUE of the same name below (one name carrying both type and value through the
 * barrel).
 */
export type IServiceManifest<S extends string = 'singleton'> = ServiceManifestInterface<S>;

/**
 * The construct side of the public `ServiceManifest`: `new ServiceManifest<S>()`
 * builds a `ServiceManifestClass<S>`, whose `build()` this module supplied.
 */
export interface ServiceManifestCtor {
  new<S extends string = 'singleton'>(): IServiceManifest<S>;
}

export const ServiceManifest: ServiceManifestCtor = ServiceManifestClass;
