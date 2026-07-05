import type { HostBuilderContext, IHost, IHostBuilder } from "@rhombus-std/hosting.core";
import type { Action } from "@rhombus-toolkit/func";

/**
 * Stub `IHostBuilder` implementation. The real Generic Host port wires this up to
 * `@rhombus-std/di` (+ its compile-time transformer) and `@rhombus-std/config` in a
 * later increment; for now every method is a placeholder.
 */
export class HostBuilder implements IHostBuilder {
  readonly properties = new Map<string | symbol, unknown>();

  configureHostConfiguration(_configureDelegate: Action<[HostBuilderContext]>): this {
    throw new Error("not implemented");
  }

  configureServices(_configureDelegate: Action<[HostBuilderContext]>): this {
    throw new Error("not implemented");
  }

  build(): IHost {
    throw new Error("not implemented");
  }
}
