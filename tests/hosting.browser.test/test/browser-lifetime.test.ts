import { BrowserLifetime, BrowserLifetimeOptions, PageLifecycleEvents } from '@rhombus-std/hosting.browser';
import { NullLoggerFactory } from '@rhombus-std/logging';
import { neverSignal } from '@rhombus-std/primitives';
import { expect, test } from 'bun:test';
import { FakeApplicationLifetime, makeFakePage } from './fakes';

function makeLifetime(configure?: (options: BrowserLifetimeOptions) => void) {
  const page = makeFakePage();
  const applicationLifetime = new FakeApplicationLifetime();
  const options = new BrowserLifetimeOptions();
  configure?.(options);
  // The bridge is the single DOM-listening component; the lifetime consumes it
  // as its event source.
  const bridge = new PageLifecycleEvents(page.context);
  const lifetime = new BrowserLifetime(
    options,
    applicationLifetime,
    NullLoggerFactory.instance,
    bridge,
  );
  return { page, applicationLifetime, bridge, lifetime };
}

test('the bridge is the single DOM listener; waitForStart subscribes without adding DOM listeners', async () => {
  const { page, lifetime } = makeLifetime();

  // The bridge attached its five page-lifecycle listeners at construction.
  expect(page.document.registeredTypes.slice().sort()).toEqual(['freeze', 'resume', 'visibilitychange']);
  expect(page.window.registeredTypes.slice().sort()).toEqual(['pagehide', 'pageshow']);

  await lifetime.waitForStart(neverSignal);

  // Still five — the lifetime subscribes to the bridge, it does not touch the DOM.
  expect(page.document.listenerCount + page.window.listenerCount).toBe(5);
});

test('never registers unload or beforeunload (bfcache disqualifiers)', async () => {
  const { page, lifetime } = makeLifetime();

  await lifetime.waitForStart(neverSignal);

  const all = [...page.document.registeredTypes, ...page.window.registeredTypes];
  expect(all).not.toContain('unload');
  expect(all).not.toContain('beforeunload');
});

test('terminal pagehide (persisted=false) requests a graceful shutdown', async () => {
  const { page, applicationLifetime, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);

  // The synchronous abort dispatch is the flush backstop: the stopping listener
  // must have run before the pagehide dispatch returned — the whole path
  // (bridge phase -> subscriber -> stopApplication -> abort) is synchronous.
  let flushedDuringDispatch = false;
  applicationLifetime.applicationStopping.addEventListener('abort', () => {
    flushedDuringDispatch = true;
  }, { once: true });

  page.pageHide(false);

  expect(applicationLifetime.stopCalls).toBe(1);
  expect(flushedDuringDispatch).toBe(true);
});

test('bfcache pagehide (persisted=true) NEVER stops the host', async () => {
  const { page, applicationLifetime, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);

  page.pageHide(true);

  expect(applicationLifetime.stopCalls).toBe(0);
  expect(applicationLifetime.applicationStopping.aborted).toBe(false);
});

test('bfcache restore (pageshow persisted=true) does not stop the host', async () => {
  const { page, applicationLifetime, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);

  page.pageHide(true);
  page.pageShow(true);
  page.changeVisibility('visible');

  expect(applicationLifetime.stopCalls).toBe(0);
});

test('stopOnPagehide=false suppresses the shutdown request', async () => {
  const { page, applicationLifetime, lifetime } = makeLifetime((options) => {
    options.stopOnPagehide = false;
  });
  await lifetime.waitForStart(neverSignal);

  page.pageHide(false);

  expect(applicationLifetime.stopCalls).toBe(0);
});

test('stop disposes the bridge — every listener detaches', async () => {
  const { page, applicationLifetime, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);
  expect(page.document.listenerCount + page.window.listenerCount).toBe(5);

  await lifetime.stop(neverSignal);

  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);

  // Detached: a later terminal pagehide no longer reaches the lifetime.
  page.pageHide(false);
  expect(applicationLifetime.stopCalls).toBe(0);
});

test('dispose disposes the bridge — every listener detaches', async () => {
  const { page, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);

  lifetime[Symbol.dispose]();

  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);
});
