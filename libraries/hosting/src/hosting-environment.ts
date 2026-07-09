// HostingEnvironment -- ported from the reference hosting runtime's
// `HostingEnvironment` (the mutable `IHostEnvironment` implementation the host
// populates during the build). `contentRootFileProvider` defaults to a
// `NullFileProvider`; a physical file provider is deferred (see decisions.md
// §20).

import type { IFileProvider } from "@rhombus-std/fileproviders.core";
import { NullFileProvider } from "@rhombus-std/fileproviders.core";
import { HOST_ENVIRONMENT_AUGMENTATION_TOKEN } from "@rhombus-std/hosting.core";
import type { IHostEnvironment } from "@rhombus-std/hosting.core";
import { augment } from "@rhombus-std/primitives";

/**
 * The mutable {@link IHostEnvironment} the host populates while building. This
 * supports infrastructure and is not intended to be used directly.
 */
@augment(HOST_ENVIRONMENT_AUGMENTATION_TOKEN)
export class HostingEnvironment implements IHostEnvironment {
  public environmentName = "";
  public applicationName = "";
  public contentRootPath = "";
  public contentRootFileProvider: IFileProvider = new NullFileProvider();
}
