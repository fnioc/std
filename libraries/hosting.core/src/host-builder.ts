import type { Action } from "@rhombus-toolkit/func";
import type { IHost } from "./host";

/**
 * Ambient info available while a host is being configured. `contentRootPath` is kept as a
 * plain string -- `IFileProvider`/`ContentRootFileProvider` are not ported, so there's no
 * abstraction over the filesystem here.
 */
export interface HostBuilderContext {
  contentRootPath: string;
  environmentName: string;
  applicationName: string;
}

/**
 * Builds an `IHost`. This is the primary API surface for assembling a host -- service
 * registration (`@rhombus-std/di`) and configuration (`@rhombus-std/config`) wiring are
 * deferred to a later increment; `configureServices` below is a placeholder shape until
 * that lands.
 */
export interface IHostBuilder {
  readonly properties: Map<string | symbol, unknown>;
  configureHostConfiguration(configureDelegate: Action<[HostBuilderContext]>): this;
  configureServices(configureDelegate: Action<[HostBuilderContext]>): this;
  build(): IHost;
}
