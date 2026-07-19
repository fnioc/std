// Install wiring for `ConfigRootAugmentations` (the IConfigRoot debug-view
// member set, which now lives in @rhombus-std/config.core -- the assembly
// mirroring the reference `.Configuration.Abstractions`). The member set is
// pure and lives in core; the install -- the `applyAugmentations` calls plus
// the `declare module` merges -- stays here, because it references the concrete
// engine classes (ConfigRoot/ConfigManager) config.core cannot import.
//
// Importing this module installs the fluent form onto the concrete root
// prototypes. The barrel re-exports `ConfigRootAugmentations` and
// `ConfigDebugViewContext` from core so the standalone surface stays reachable
// from @rhombus-std/config too.

import { type ConfigDebugViewContext, ConfigRootAugmentations } from '@rhombus-std/config.core';
import { applyAugmentations } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { ConfigManager } from './ConfigManager';
import { ConfigRoot } from './ConfigRoot';

// DELIBERATELY no interface-side merge onto IConfigRoot -- same
// several-impls reasoning as ConfigAugmentations (see
// ./config-augmentations-install): a merge would force phantom members onto
// every wrapper/fake implementer. The fluent form is typed per concrete class
// below; an interface-typed root uses the standalone
// `ConfigRootAugmentations.getDebugView` form.
declare module './ConfigRoot' {
  interface ConfigRoot {
    getDebugView(processValue?: Func<[ConfigDebugViewContext], string>): string;
  }
}

declare module './ConfigManager' {
  interface ConfigManager {
    getDebugView(processValue?: Func<[ConfigDebugViewContext], string>): string;
  }
}

applyAugmentations(ConfigRoot, ConfigRootAugmentations);
applyAugmentations(ConfigManager, ConfigRootAugmentations);
