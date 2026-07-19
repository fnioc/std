// Install wiring for `ConfigAugmentations` (the IConfig convenience member set,
// which now lives in @rhombus-std/config.core -- the assembly mirroring the
// reference `.Configuration.Abstractions`). The member set is pure and lives in
// core; the install -- the `applyAugmentations` calls plus the `declare module`
// merges -- must stay here, because it references the concrete engine classes
// (ConfigRoot/ConfigSection/ConfigManager) that config.core cannot import
// without inverting the config.core <- config edge.
//
// Importing this module installs the fluent forms onto the concrete
// prototypes. The barrel re-exports `ConfigAugmentations`/`exists` from core so
// the standalone member surface stays reachable from @rhombus-std/config too.

import { ConfigAugmentations, type IConfigSection } from '@rhombus-std/config.core';
import { applyAugmentations } from '@rhombus-std/primitives';
import { ConfigManager } from './ConfigManager';
import { ConfigRoot } from './ConfigRoot';
import { ConfigSection } from './ConfigSection';

// DELIBERATELY no interface-side merge onto IConfig. This is a CLOSED
// set, and IConfig has MANY implementers -- the three concrete classes
// below, plus every wrapper/fake a consumer hands to e.g.
// ChainedConfigProvider. An interface merge would force those
// implementers to carry members that are only ever installed on OUR concrete
// prototypes (phantom methods -- typed but absent at runtime), the same
// several-impls reasoning that kept ILogger's log* wrappers standalone-only
// (docs §36/§38). The fluent form is typed per concrete class below; an
// interface-typed value uses the standalone `ConfigAugmentations.*` form.
declare module './ConfigRoot' {
  interface ConfigRoot {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

declare module './ConfigSection' {
  interface ConfigSection {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

declare module './ConfigManager' {
  interface ConfigManager {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

applyAugmentations(ConfigRoot, ConfigAugmentations);
applyAugmentations(ConfigSection, ConfigAugmentations);
applyAugmentations(ConfigManager, ConfigAugmentations);
