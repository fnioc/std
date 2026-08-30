// A root also exposes `key`/`path`/`value` structurally, so a duck-type check
// can't tell it apart from a genuine section -- the concrete section stamps
// itself with a unique-symbol brand instead, and this guard reads it.
//
// The brand lives here in config.core so the concrete section (in
// @rhombus-std/config) and every consumer resolve the SAME symbol; keeping
// config.core external is what keeps that symbol a shared singleton rather
// than a forked private copy. `ConfigRoot`/`ConfigManager` do not apply the
// brand, so the guard returns `false` for them.

import { hasMember } from '@rhombus-toolkit/type-guards';
import { configSectionBrand, type IConfigSection } from './IConfigSection';

/**
 * Whether `config` is a genuine {@link IConfigSection} rather than a root.
 * Reads the {@link configSectionBrand} the concrete section stamps on itself.
 */
export function isConfigSection(config: unknown): config is IConfigSection {
  return hasMember(config, configSectionBrand) && config[configSectionBrand] === true;
}
