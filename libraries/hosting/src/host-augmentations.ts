// Class-side declaration merges (docs §28/§38) for the hosting augmentations
// whose receiver interfaces (IHost / IHostBuilder / IHostEnvironment) live in
// hosting.core but whose only concrete classes (Host / HostBuilder /
// HostingEnvironment) live in THIS package.
//
// The runtime install now flows through the augmentation registry: each concrete
// class is decorated with `@augment(<receiver>_AUGMENTATION_TOKEN)` at its own
// definition, and the augmentation sets register against those tokens beside
// their consts (hosting.core's Host/HostBuilder/HostEnvironment sets and this
// package's `./builder-augmentations` runtime set). What remains HERE is the
// class-side merge: each concrete class must still SATISFY its interface once the
// augmentation members are merged onto it, so we declaration-merge the same
// member signatures onto the concrete classes. (The interface-side merges live
// beside their consts per rule 0.6 -- IHost in hosting.core/host-augmentations,
// startHost in hosting.core/host-builder-augmentations, the nine IHostBuilder
// runtime members in ./builder-augmentations, IHostEnvironment in
// hosting.core/host-environment-augmentations.)

import type { ServiceProviderOptions } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import type { HostBuilderContext, IHost } from "@rhombus-std/hosting.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import type { AbortSignal } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import type { ConsoleLifetimeOptions } from "./ConsoleLifetimeOptions";
import type { HostOptions } from "./HostOptions";

declare module "./internal/Host" {
  interface Host {
    run(abortSignal?: AbortSignal): Promise<void>;
    runAsync(abortSignal?: AbortSignal): Promise<void>;
    waitForShutdownAsync(abortSignal?: AbortSignal): Promise<void>;
    stopWithTimeout(timeoutMs: number): Promise<void>;
  }
}

declare module "./HostBuilder" {
  interface HostBuilder {
    startHost(abortSignal?: AbortSignal): Promise<IHost>;
    configureDefaults(args?: readonly string[]): this;
    useEnvironment(environment: string): this;
    useContentRoot(contentRoot: string): this;
    // No-context convenience overload first (the dominant form; an un-annotated
    // one-parameter lambda resolves to it). The context form is the second
    // overload -- annotate its parameters, or pass a two-parameter function.
    configureHostOptions(configureOptions: Func<[HostOptions], void>): this;
    configureHostOptions(configureOptions: Func<[HostBuilderContext, HostOptions], void>): this;
    configureLogging(configureLoggingDelegate: Func<[ILoggingBuilder], void>): this;
    configureLogging(configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[IMetricsBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): this;
    useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], void>): this;
    useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
    runConsoleAsync(abortSignal?: AbortSignal): Promise<void>;
  }
}

declare module "./internal/HostingEnvironment" {
  interface HostingEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

// The internal HostBuilderAdapter is also an `IHostBuilder`, decorated
// `@augment(nameof<IHostBuilder>())`, so it pulls the same registered bag as the
// concrete `HostBuilder`. Its class-side merge is therefore identical.
declare module "./internal/HostBuilderAdapter" {
  interface HostBuilderAdapter {
    startHost(abortSignal?: AbortSignal): Promise<IHost>;
    configureDefaults(args?: readonly string[]): this;
    useEnvironment(environment: string): this;
    useContentRoot(contentRoot: string): this;
    // No-context convenience overload first (the dominant form; an un-annotated
    // one-parameter lambda resolves to it). The context form is the second
    // overload -- annotate its parameters, or pass a two-parameter function.
    configureHostOptions(configureOptions: Func<[HostOptions], void>): this;
    configureHostOptions(configureOptions: Func<[HostBuilderContext, HostOptions], void>): this;
    configureLogging(configureLoggingDelegate: Func<[ILoggingBuilder], void>): this;
    configureLogging(configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[IMetricsBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): this;
    useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], void>): this;
    useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
    runConsoleAsync(abortSignal?: AbortSignal): Promise<void>;
  }
}
