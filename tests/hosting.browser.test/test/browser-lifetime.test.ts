import { BrowserLifetime, BrowserLifetimeOptions } from '@rhombus-std/hosting.browser';
import { NullLoggerFactory } from '@rhombus-std/logging';
import { neverSignal } from '@rhombus-std/primitives';
import { expect, test } from 'bun:test';
import { FakeApplicationLifetime, makeFakePage } from './fakes';

function makeLifetime(configure?: (options: BrowserLifetimeOptions) => void) {
  const page = makeFakePage();
  const applicationLifetime = new FakeApplicationLifetime();
  const options = new BrowserLifetimeOptions();
  configure?.(options);
  const lifetime = new BrowserLifetime(
    options,
    applicationLifetime,
    NullLoggerFactory.instance,
    page.context,
  );
  return { page, applicationLifetime, lifetime };
}

test('waitForStart attaches the five page-lifecycle listeners and resolves immediately', async () => {
  const { page, lifetime } = makeLifetime();

  await lifetime.waitForStart(neverSignal);

  expect(page.document.registeredTypes.slice().sort()).toEqual(['freeze', 'resume', 'visibilitychange']);
  expect(page.window.registeredTypes.slice().sort()).toEqual(['pagehide', 'pageshow']);
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

  // The synchronous abort dispatch is the flush backstop: the stopping
  // listener must have run before the pagehide handler returned.
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

test('stop detaches every listener', async () => {
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

test('dispose detaches every listener', async () => {
  const { page, lifetime } = makeLifetime();
  await lifetime.waitForStart(neverSignal);

  lifetime[Symbol.dispose]();

  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);
});
