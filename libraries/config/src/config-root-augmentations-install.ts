// Install wiring for `ConfigRootAugmentations` (the IConfigRoot debug-view
// member set, which lives in @rhombus-std/config.core). The member set is pure
// and lives in core, as does the interface-side merge onto IConfigRoot; the
// install -- the `applyAugmentations` calls -- stays here, because it references
// the concrete engine classes (ConfigRoot/ConfigManager) config.core cannot
// import.
//
// Importing this module installs the fluent form onto the concrete root
// prototypes. The barrel re-exports `ConfigRootAugmentations` and
// `ConfigDebugViewContext` from core so the standalone surface stays reachable
// from @rhombus-std/config too.

import { ConfigRootAugmentations } from '@rhombus-std/config.core';
import { applyAugmentations } from '@rhombus-std/primitives';
import { ConfigManager } from './ConfigManager';
import { ConfigRoot } from './ConfigRoot';

applyAugmentations(ConfigRoot, ConfigRootAugmentations);
applyAugmentations(ConfigManager, ConfigRootAugmentations);
