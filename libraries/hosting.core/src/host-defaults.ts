/** Constants for host builder configuration keys. */
export const HostDefaults = {
  /** The configuration key used to set {@link IHostEnvironment.applicationName}. */
  applicationKey: 'applicationName',
  /** The configuration key used to set {@link IHostEnvironment.environmentName}. */
  environmentKey: 'environment',
  /**
   * The configuration key used to set {@link IHostEnvironment.contentRootPath}
   * and {@link IHostEnvironment.contentRootFileProvider}.
   */
  contentRootKey: 'contentRoot',
} as const;
