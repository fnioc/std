// The augmentation-registry token for config.core's OPEN augmentation-target
// receiver, `IConfigurationBuilder` (docs/decisions.md §38). This string keys the
// primitives augmentation registry's bag for the configuration-builder receiver,
// so every provider package (`config.json`/`config.env`/`config.commandline`, the
// memory source, the chained-configuration source) registers its augmentation set
// against the same token. Both concrete builders — `ConfigurationBuilder` and
// `ConfigurationManager` (which is itself an `IConfigurationBuilder`) — are
// decorated with this single token.
//
// The value is a plain `nameof`-format string (`<package>:<TypeName>`); the
// transformer's `nameof<IConfigurationBuilder>()` derives the identical literal.

import type { Token } from "@rhombus-std/primitives";

/** Registry token for the `IConfigurationBuilder` augmentation receiver. */
export const CONFIGURATION_BUILDER_AUGMENTATION_TOKEN: Token = "@rhombus-std/config.core:IConfigurationBuilder";
