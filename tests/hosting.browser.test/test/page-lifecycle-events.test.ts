import { PageLifecycleEvents } from "@rhombus-std/hosting.browser";
import { expect, test } from "bun:test";
import { makeFakePage } from "./fakes";

test("attaches eagerly at construction and never registers unload/beforeunload", () => {
  const page = makeFakePage();

  const bridge = new PageLifecycleEvents(page.context);

  const all = [...page.document.registeredTypes, ...page.window.registeredTypes];
  expect(all.slice().sort()).toEqual(["freeze", "pagehide", "pageshow", "resume", "visibilitychange"]);
  expect(all).not.toContain("unload");
  expect(all).not.toContain("beforeunload");
  bridge[Symbol.dispose]();
});

test("phase snapshots the current visibility and stays a stable primitive", () => {
  const page = makeFakePage();
  page.document.visibilityState = "hidden";
  const bridge = new PageLifecycleEvents(page.context);

  expect(bridge.phase).toBe("hidden");
  expect(bridge.phase).toBe(bridge.phase);

  page.changeVisibility("visible");
  expect(bridge.phase).toBe("visible");
  bridge[Symbol.dispose]();
});

test("subscribe replays the current state to a late subscriber and notifies on change", () => {
  const page = makeFakePage();
  const bridge = new PageLifecycleEvents(page.context);
  page.changeVisibility("hidden");

  // Late subscriber: the replay fires immediately, seeing the CURRENT phase.
  const seen: string[] = [];
  const unsubscribe = bridge.subscribe(() => {
    seen.push(bridge.phase);
  });
  expect(seen).toEqual(["hidden"]);

  page.changeVisibility("visible");
  expect(seen).toEqual(["hidden", "visible"]);

  unsubscribe();
  page.changeVisibility("hidden");
  expect(seen).toEqual(["hidden", "visible"]);
  bridge[Symbol.dispose]();
});

test("the flush signal is RECURRING: it fires on every transition to hidden", () => {
  const page = makeFakePage();
  const bridge = new PageLifecycleEvents(page.context);

  let flushes = 0;
  bridge.onFlush(() => {
    flushes += 1;
  });

  page.changeVisibility("hidden");
  expect(flushes).toBe(1);

  page.changeVisibility("visible");
  expect(flushes).toBe(1);

  // A SECOND hidden fires again — non-terminal, recurring.
  page.changeVisibility("hidden");
  expect(flushes).toBe(2);
  bridge[Symbol.dispose]();
});

test("bfcache restore surfaces as the onRestore event, and freeze/pagehide drive the phase", () => {
  const page = makeFakePage();
  const bridge = new PageLifecycleEvents(page.context);

  let restores = 0;
  bridge.onRestore(() => {
    restores += 1;
  });

  page.changeVisibility("hidden");
  page.document.dispatch("freeze");
  expect(bridge.phase).toBe("frozen");

  // resume leaves the frozen phase, re-reading the live visibility state.
  page.document.visibilityState = "visible";
  page.document.dispatch("resume");
  expect(bridge.phase).toBe("visible");

  page.pageShow(true);
  expect(restores).toBe(1);
  expect(bridge.phase).toBe("visible");

  // A non-persisted pageshow (a fresh load) is NOT a restore.
  page.pageShow(false);
  expect(restores).toBe(1);

  // Entering the bfcache is frozen; a discard is terminated.
  page.pageHide(true);
  expect(bridge.phase).toBe("frozen");
  page.pageHide(false);
  expect(bridge.phase).toBe("terminated");
  bridge[Symbol.dispose]();
});

test("dispose detaches everything and drops subscribers", () => {
  const page = makeFakePage();
  const bridge = new PageLifecycleEvents(page.context);
  let notifications = 0;
  bridge.subscribe(() => {
    notifications += 1;
  });
  expect(notifications).toBe(1);

  bridge[Symbol.dispose]();

  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);
  page.changeVisibility("hidden");
  expect(notifications).toBe(1);
});
