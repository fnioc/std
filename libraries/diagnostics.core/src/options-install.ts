// Mounts the MetricsOptions / TracingOptions rule mutators onto their concrete
// classes. Both sets are CLOSED -- the option classes live in this package -- so
// the install is a direct applyAugmentations rather than a registry
// registration. The interface-side merges live beside each set.

import { applyAugmentations } from '@rhombus-std/primitives';

import { MetricsOptions } from './metrics/MetricsOptions';
import { MetricsOptionsAugmentations } from './metrics/MetricsOptions-augmentations';
import { TracingOptions } from './tracing/TracingOptions';
import { TracingOptionsAugmentations } from './tracing/TracingOptions-augmentations';

applyAugmentations(MetricsOptions, MetricsOptionsAugmentations);
applyAugmentations(TracingOptions, TracingOptionsAugmentations);
