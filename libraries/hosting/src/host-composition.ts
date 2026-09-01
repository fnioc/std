// Shared host-composition tail for both builders, factored out so the classic
// `HostBuilder` and the modern `HostApplicationBuilder` compose identically.
//
// The internal `Host` is constructed with its dependencies passed DIRECTLY
// (ctor args), not resolved from the container:
//   - The framework singletons (`ApplicationLifetime`, the `LoggerFactory`, the
//     resolved `HostOptions`) are constructed eagerly and registered as VALUES,
//     so `IHost.services` hands the SAME instance back to a consumer that
//     resolves them (a class or factory registration would build afresh off the
//     frameless root). This is what keeps
//     `waitForShutdownAsync`'s `HOST_APPLICATION_LIFETIME_TYPE` lookup
//     returning the very lifetime the host drives.
//   - Logging: the hosting layer OWNS one `LoggerFactory` and threads it,
//     because a `LoggerFactory` built by `addLogging` does not yet inject the
//     registered provider set. The registered providers are resolved off the
//     built container and folded into the owned factory, so the host's own
//     loggers -- and any composite logger already handed out -- light up.

// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import type { IConfig } from '@rhombus-std/config.core';
import { di, noopLifetimeAddon, validateBuildability } from '@rhombus-std/di';
import { type Manifest } from '@rhombus-std/di.core';
import { Environments, type HostBuilderContext, HostDefaults, type IHost, type IHostApplicationLifetime, type IHostEnvironment, type IHostLifetime } from '@rhombus-std/hosting.core';
import { LoggerFactory } from '@rhombus-std/logging';
import type { ILoggerFactory, ILoggerProvider } from '@rhombus-std/logging.core';
import { Type } from '@rhombus-std/primitives';
import { process } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { HOST_LIFETIME_TYPE, HOST_OPTIONS_CONFIGURE_TYPE } from './framework-types';
import { HostOptions } from './HostOptions';
import { ApplicationLifetime } from './internal/ApplicationLifetime';
import { Host } from './internal/Host';
import { HostingEnvironment } from './internal/HostingEnvironment';
import { NullLifetime } from './internal/NullLifetime';
import type { ServiceProviderOptions } from './ServiceProviderOptionsFactory';

/** The category the internal host writes its lifecycle log messages under. */
const HOST_LOGGER_CATEGORY = 'Rhombus.Hosting.Host';

/** The category the {@link ApplicationLifetime} writes its callback-error messages under. */
const APPLICATION_LIFETIME_CATEGORY = 'Rhombus.Hosting.ApplicationLifetime';

/** The hosting-owned framework singletons threaded through the composition. */
export interface FrameworkServices {
  /** The single {@link LoggerFactory} the host threads to every framework logger. */
  readonly loggerFactory: LoggerFactory;
  /** The single {@link ApplicationLifetime} the host drives and hands back via DI. */
  readonly applicationLifetime: ApplicationLifetime;
  /** The resolved {@link HostOptions} the host obeys. */
  readonly hostOptions: HostOptions;
}

// Minimal pure-string posix path helpers replacing `node:path` -- a static
// `node:path` import is a bundler-time break for browser targets, and hosting
// only ever feeds these two the content-root inputs below: an absolute posix
// `basePath` (a `process.cwd()`-style path) and a possibly-relative
// `contentRootPath`. Behaviour matches Node's posix `path.isAbsolute` /
// `path.resolve` for exactly those inputs (the hosting test suite is the
// arbiter); nothing else in the package touches `node:path`.

/** Posix `path.isAbsolute`: a path is absolute iff it begins with `/`. */
function isAbsolute(path: string): boolean {
  return path.charCodeAt(0) === 47; // '/'
}

/**
 * Normalizes an absolute posix path's segments, resolving `.`/`..` and
 * collapsing redundant separators. Mirrors Node's internal `normalizeString`
 * for a rooted path: a `..` at the root is dropped (never escapes above it),
 * and no trailing separator is emitted.
 */
function normalizeAbsoluteSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

/**
 * Posix `path.resolve(base, path)` for an absolute `base` and a relative
 * `path` -- the only shape {@link resolveContentRootPath} produces (the
 * absolute-`path` case is short-circuited by its caller). Returns a normalized
 * absolute path.
 */
function resolvePath(base: string, path: string): string {
  return '/' + normalizeAbsoluteSegments(base + '/' + path);
}

/**
 * Resolves a content-root path against `basePath`: returns `basePath` for an
 * empty input, the path itself when already absolute, otherwise the path
 * resolved against `basePath`.
 */
export function resolveContentRootPath(contentRootPath: string | undefined, basePath: string): string {
  if (!contentRootPath) {
    return basePath;
  }
  if (isAbsolute(contentRootPath)) {
    return contentRootPath;
  }
  return resolvePath(basePath, contentRootPath);
}

/**
 * Constructs the mutable {@link HostingEnvironment} from `config`, reading the
 * {@link HostDefaults} keys. `contentRootFileProvider` keeps its
 * `NullFileProvider` default (the physical file provider isn't wired in here
 * yet). `basePath` defaults to the current working directory.
 */
export function createHostingEnvironment(config: IConfig): HostingEnvironment {
  const environment = new HostingEnvironment();
  environment.environmentName = config.get(HostDefaults.environmentKey) ?? Environments.Production;
  // `process.cwd()` is reached only when the configured content root doesn't
  // already resolve on its own: an already-absolute root short-circuits BEFORE
  // the cwd lookup, so a browser composition (no `process` global; content
  // root seeded to "/" by @rhombus-std/hosting.browser) never touches it.
  const contentRootPath = config.get(HostDefaults.contentRootKey);
  environment.contentRootPath = contentRootPath !== undefined && isAbsolute(contentRootPath)
    ? contentRootPath
    : resolveContentRootPath(contentRootPath, process.cwd());
  const applicationName = config.get(HostDefaults.applicationKey);
  if (applicationName) {
    environment.applicationName = applicationName;
  }
  return environment;
}

/**
 * Constructs the hosting-owned framework singletons: one {@link LoggerFactory},
 * the {@link ApplicationLifetime} (logging through it), and an un-initialized
 * {@link HostOptions}. {@link resolveHost} folds the final configuration into
 * `hostOptions` and applies the `configureHostOptions` mutations at build time
 * -- deferred to then so the modern builder's live {@link IConfig} is
 * fully populated first.
 */
export function createFrameworkServices(): FrameworkServices {
  const loggerFactory = new LoggerFactory([]);
  const applicationLifetime = new ApplicationLifetime(loggerFactory.createLogger(APPLICATION_LIFETIME_CATEGORY));
  return { loggerFactory, applicationLifetime, hostOptions: new HostOptions() };
}

/**
 * Registers the framework services into `services`. Runs BEFORE the user's
 * configure-services delegates so a later `useConsoleLifetime` (which appends a
 * {@link HOST_LIFETIME_TYPE} registration) wins last over the default
 * {@link NullLifetime} registered here. Returns the manifest produced by every
 * registration -- the chain is immutable, so the caller must thread this
 * result forward instead of reusing the `services` it passed in.
 */
export function populateFrameworkServices(services: Manifest<unknown>, context: HostBuilderContext, environment: HostingEnvironment, config: IConfig, framework: FrameworkServices): Manifest<unknown> {
  let s = services.addValue<IHostEnvironment>(environment);
  s = s.addValue<HostBuilderContext>(context);
  s = s.addValue<IConfig>(config);
  s = s.addValue<IHostApplicationLifetime>(framework.applicationLifetime);
  s = s.addValue<HostOptions>(framework.hostOptions);
  s = s.addValue<ILoggerFactory>(framework.loggerFactory);

  // The default host lifetime. `useConsoleLifetime` appends a ConsoleLifetime
  // registration under the same type; di.core is append-only last-wins, so the
  // console lifetime overrides this when requested.
  return s.add(HOST_LIFETIME_TYPE, NullLifetime, Type.ctor(HOST_LIFETIME_TYPE, [[]]));
}

/**
 * Builds the provider and constructs the internal {@link Host}. Loads the
 * container's registered {@link ILoggerProvider}s into the owned
 * {@link LoggerFactory}, resolves the (possibly overridden) host lifetime, and
 * hands the internal host its dependencies directly.
 *
 * `config` is the final application configuration folded into
 * {@link HostOptions} before the `configureHostOptions` mutations run.
 *
 * `serviceProviderOptions` carries the `validateOnBuild` toggle the builders
 * resolved, wired to the `validateBuildability` addon; omitted ⇒ an
 * unvalidated build.
 */
export function resolveHost(services: Manifest<unknown>, framework: FrameworkServices, config: IConfig, serviceProviderOptions?: ServiceProviderOptions): IHost {
  let builder = di.usingLifetimeModel(noopLifetimeAddon())
    .usingManifest(services);
  if (serviceProviderOptions?.validateOnBuild) {
    builder = builder.useAddon(validateBuildability());
  }
  const provider = builder.build();

  const loggerProviders: ILoggerProvider[] = provider.resolve<ILoggerProvider[]>();
  for (const loggerProvider of loggerProviders) {
    framework.loggerFactory.addProvider(loggerProvider);
  }

  // Fold the final configuration into HostOptions, then apply every
  // `configureHostOptions` mutation (registered as a value in
  // `populateFrameworkServices`; the consumer resolving HOST_OPTIONS_TYPE sees
  // the same mutated instance).
  framework.hostOptions.initialize(config);
  const configureSteps: Func<[HostOptions], void>[] = provider.resolve(
    Type.array(HOST_OPTIONS_CONFIGURE_TYPE),
  );
  for (const configureStep of configureSteps) {
    configureStep(framework.hostOptions);
  }

  const hostLifetime = provider.resolve<IHostLifetime>();
  const logger = framework.loggerFactory.createLogger(HOST_LOGGER_CATEGORY);

  return new Host(provider, framework.applicationLifetime, logger, hostLifetime, framework.hostOptions);
}
