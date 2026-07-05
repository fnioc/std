import type { IHostBuilder } from "@rhombus-std/hosting.core";
import { HostBuilder } from "./host-builder";

/** Entry point mirroring .NET's static `Host` class. */
export const Host = {
  createDefaultBuilder(): IHostBuilder {
    return new HostBuilder();
  },
};
