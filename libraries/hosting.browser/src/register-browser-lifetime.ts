// The shared BrowserLifetime registration — the composition seam both entry
// points route through: `useBrowserLifetime` (the classic-builder augmentation)
// and `BrowserHost.createApplicationBuilder` (the modern-builder facade). The
// options land as a value, and the lifetime lands as a factory under the
// imported HOST_LIFETIME_TYPE — di.core is append-only last-wins, so this
// overrides the default NullLifetime registered by the host composition.

// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import { type IServiceProvider } from '@rhombus-std/di.core';
import type { Manifest } from '@rhombus-std/di.core';
import { HOST_LIFETIME_TYPE } from '@rhombus-std/hosting';
import type { IHostApplicationLifetime } from '@rhombus-std/hosting.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { BrowserLifetime } from './BrowserLifetime';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageContext } from './page-context';
import { PageLifecycleEvents } from './PageLifecycleEvents';

/**
 * Registers `options`, the eagerly-attached {@link PageLifecycleEvents} bridge,
 * and a {@link BrowserLifetime} factory (under the imported
 * {@link HOST_LIFETIME_TYPE} — last registration wins over the default
 * NullLifetime). Both the modern facade and the classic `useBrowserLifetime`
 * route through here, so the bridge is registered on BOTH paths. The bridge is
 * an unowned value the container never disposes, so it is handed to the
 * lifetime, whose `stop`/dispose detaches it — see {@link BrowserLifetime}.
 * `context` is threaded for tests; production callers omit it and both the
 * lifetime and the bridge attach to the platform document/window. Returns the
 * manifest produced by every registration -- the chain is immutable, so the
 * caller must thread this result forward instead of reusing the `services` it
 * passed in.
 */
export function registerBrowserLifetime(services: Manifest<unknown>, options: BrowserLifetimeOptions, context?: PageContext): Manifest<unknown> {
  let s = services.addValue<BrowserLifetimeOptions>(options);

  const pageLifecycleEvents = new PageLifecycleEvents(context);
  s = s.addValue<PageLifecycleEvents>(pageLifecycleEvents);

  return s.add(HOST_LIFETIME_TYPE,
    (resolver: IServiceProvider) =>
      new BrowserLifetime(resolver.getService<BrowserLifetimeOptions>(), resolver.getService<IHostApplicationLifetime>(), resolver.getService<ILoggerFactory>(), pageLifecycleEvents),
    Type.func(HOST_LIFETIME_TYPE, [[typefor<IServiceProvider>()]]));
}
