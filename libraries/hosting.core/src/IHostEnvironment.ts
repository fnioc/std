import type { IFileProvider } from "@rhombus-std/fileproviders.core";

/** Provides information about the hosting environment an application is running in. */
export interface IHostEnvironment {
  /**
   * The name of the environment. The host sets this to the value of the
   * "environment" configuration key.
   */
  environmentName: string;

  /**
   * The name of the application. The host sets this to the entry point's
   * package name.
   */
  applicationName: string;

  /** The absolute path to the directory that contains the application content files. */
  contentRootPath: string;

  /** An {@link IFileProvider} pointing at {@link contentRootPath}. */
  contentRootFileProvider: IFileProvider;
}
