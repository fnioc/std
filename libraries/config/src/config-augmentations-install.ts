// Install wiring for `ConfigAugmentations` (the IConfig convenience member
// set, which lives in @rhombus-std/config.core). The member set is pure and
// lives in core, as does the interface-side merge onto IConfig; the install --
// the `applyAugmentations` calls -- must stay here, because it references the
// concrete engine classes (ConfigRoot/ConfigSection/ConfigManager) that
// config.core cannot import without inverting the config.core <- config edge.
//
// Importing this module installs the fluent forms onto the concrete
// prototypes. The barrel re-exports `ConfigAugmentations`/`exists` from core so
// the standalone member surface stays reachable from @rhombus-std/config too.

import { ConfigAugmentations } from '@rhombus-std/config.core';
import { applyAugmentations } from '@rhombus-std/primitives';
import { ConfigManager } from './ConfigManager';
import { ConfigRoot } from './ConfigRoot';
import { ConfigSection } from './ConfigSection';

applyAugmentations(ConfigRoot, ConfigAugmentations);
applyAugmentations(ConfigSection, ConfigAugmentations);
applyAugmentations(ConfigManager, ConfigAugmentations);
