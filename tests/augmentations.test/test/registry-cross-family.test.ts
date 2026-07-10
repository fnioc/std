// Cross-family augmentation-registry behaviour (docs decisions.md §38): the
// registry decouples WHERE a set registers (the owning package, beside the
// const) from WHERE it installs (every `@augment`-decorated class sharing the
// token) -- including classes in packages the registrant has never heard of.
//
//   - hosting's independent MetricsBuilder receives the IMetricsBuilder members
//     registered by diagnostics.core / diagnostics. This is the regression test
//     for the pre-registry orphaned-builder bug: `builder.metrics.enableMetrics`
//     used to be missing because the direct applyAugmentations install in
//     diagnostics could not reach hosting's concrete class.
//   - a LATE registration (after every decorated class is long defined) still
//     reaches every subscribed prototype -- the decorator's listener stays
//     subscribed, so the bag re-installs on each later registerAugmentations.

import { ServiceManifest } from "@rhombus-std/di";
import { MetricsBuilder as DiagnosticsMetricsBuilder } from "@rhombus-std/diagnostics";
import { METRICS_CONFIGURE_TOKEN } from "@rhombus-std/diagnostics.core";
// The IMetricsBuilder augmentation-registry token is derived by `nameof<IMetricsBuilder>()`
// at each library's build time; this test (no transformer) uses the derived literal directly.
const METRICS_BUILDER_AUGMENTATION_TOKEN = "@rhombus-std/diagnostics.core:IMetricsBuilder";
import { HostApplicationBuilder, MetricsBuilder as HostingMetricsBuilder } from "@rhombus-std/hosting";
import { registerAugmentations } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

describe("hosting's MetricsBuilder receives the diagnostics-family augmentations", () => {
  test("builder.metrics.enableMetrics exists and registers a configure step", () => {
    const builder = new HostApplicationBuilder();

    // The orphaned-builder regression: enableMetrics reaches hosting's
    // MetricsBuilder through the shared token, not a direct install.
    expect(builder.metrics.enableMetrics).toBeInstanceOf(Function);
    builder.metrics.enableMetrics("some-meter");

    // The call registered a ConfigureOptions<MetricsOptions> step on the
    // builder's manifest, proving the member is diagnostics' real
    // implementation, not a lookalike.
    const configureSteps = builder.services.build().resolve<unknown[]>(`Array<${METRICS_CONFIGURE_TOKEN}>`);
    expect(configureSteps).toHaveLength(1);
  });

  test("the config-binding member registered downstream reaches it too", () => {
    const metrics = new HostingMetricsBuilder(new ServiceManifest());
    expect(metrics.addMetricsConfiguration).toBeInstanceOf(Function);
  });
});

describe("late registration reaches every decorated class sharing the token", () => {
  test("a set registered NOW installs onto both families' MetricsBuilders", () => {
    // Both concrete classes were decorated at module load, long before this
    // registration. The decorator's listener must still pull the new member.
    registerAugmentations(METRICS_BUILDER_AUGMENTATION_TOKEN, {
      lateRegisteredProbe(builder: unknown): unknown {
        return builder;
      },
    });

    type Probed = { lateRegisteredProbe(): unknown };
    const hosting = new HostingMetricsBuilder(new ServiceManifest()) as unknown as Probed;
    const diagnostics = new DiagnosticsMetricsBuilder(new ServiceManifest()) as unknown as Probed;

    expect(hosting.lateRegisteredProbe).toBeInstanceOf(Function);
    expect(diagnostics.lateRegisteredProbe).toBeInstanceOf(Function);
    // Receiver-first thunking: the method form forwards `this`.
    expect(hosting.lateRegisteredProbe()).toBe(hosting);
    expect(diagnostics.lateRegisteredProbe()).toBe(diagnostics);
  });
});
