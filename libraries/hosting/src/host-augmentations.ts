// Downstream method-form install (docs §28) for the hosting augmentations whose
// receiver interfaces (IHost / IHostBuilder / IHostEnvironment) live in
// hosting.core but whose only concrete classes (Host / HostBuilder /
// HostingEnvironment) live here.
//
// Per the cross-package rule: the interface lives in hosting.core but the
// concrete receiver classes live in this package, so BOTH the declaration merge
// onto the interface AND the runtime install onto the concrete class live here --
// a hosting.core-only consumer never gets a method type with no runtime behind
// it. The object literals themselves ship in hosting.core (the abstractions
// sets) and in ./builder-extensions (the runtime `HostingHostBuilderExtensions`);
// this module ADDS the instance-method form so `host.runAsync(...)` /
// `builder.configureDefaults(...)` / `environment.isDevelopment()` read as
// fluently as the standalone `HostingAbstractionsHostExtensions.runAsync(host,
// ...)`.

import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import type { HostBuilderContext, IHost, IHostBuilder, IHostEnvironment } from "@rhombus-std/hosting.core";
import {
  HostEnvironmentEnvExtensions,
  HostingAbstractionsHostBuilderExtensions,
  HostingAbstractionsHostExtensions,
} from "@rhombus-std/hosting.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import { HostingHostBuilderExtensions, type ServiceProviderOptions } from "./builder-extensions";
import type { ConsoleLifetimeOptions } from "./console-lifetime-options";
import { HostBuilder } from "./host-builder";
import type { HostOptions } from "./host-options";
import { HostingEnvironment } from "./hosting-environment";
import { Host } from "./internal-host";

// Merge the method form onto the OWNING interfaces (so a consumer holding the
// interface sees it) AND onto the concrete classes (so each still SATISFIES its
// interface once the new names are on it -- the same both-sides merge the
// foreign-class sites use for ServiceManifestClass).
declare module "@rhombus-std/hosting.core" {
  interface IHost {
    run(cancellationToken?: AbortSignal): Promise<void>;
    runAsync(cancellationToken?: AbortSignal): Promise<void>;
    waitForShutdownAsync(cancellationToken?: AbortSignal): Promise<void>;
    stopWithTimeout(timeoutMs: number): Promise<void>;
  }

  interface IHostBuilder {
    startHost(cancellationToken?: AbortSignal): Promise<IHost>;
    configureDefaults(args?: readonly string[]): this;
    useEnvironment(environment: string): this;
    useContentRoot(contentRoot: string): this;
    configureHostOptions(configureOptions: Func<[HostBuilderContext, HostOptions], void>): this;
    configureLogging(configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): this;
    useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], void>): this;
    useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
    runConsoleAsync(cancellationToken?: AbortSignal): Promise<void>;
  }

  interface IHostEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

declare module "./internal-host" {
  interface Host {
    run(cancellationToken?: AbortSignal): Promise<void>;
    runAsync(cancellationToken?: AbortSignal): Promise<void>;
    waitForShutdownAsync(cancellationToken?: AbortSignal): Promise<void>;
    stopWithTimeout(timeoutMs: number): Promise<void>;
  }
}

declare module "./host-builder" {
  interface HostBuilder {
    startHost(cancellationToken?: AbortSignal): Promise<IHost>;
    configureDefaults(args?: readonly string[]): this;
    useEnvironment(environment: string): this;
    useContentRoot(contentRoot: string): this;
    configureHostOptions(configureOptions: Func<[HostBuilderContext, HostOptions], void>): this;
    configureLogging(configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): this;
    configureMetrics(configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): this;
    useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], void>): this;
    useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
    runConsoleAsync(cancellationToken?: AbortSignal): Promise<void>;
  }
}

declare module "./hosting-environment" {
  interface HostingEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

applyAugmentations(Host, HostingAbstractionsHostExtensions);
applyAugmentations(HostBuilder, HostingAbstractionsHostBuilderExtensions);
applyAugmentations(HostBuilder, HostingHostBuilderExtensions);
applyAugmentations(HostingEnvironment, HostEnvironmentEnvExtensions);
