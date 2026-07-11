// Hand-rolled fake document/window EventTarget pair — small enough that
// happy-dom stays out of the devDependencies. Records EVERY addEventListener
// type (including ones outside the production unions) so the tests can assert
// that unload/beforeunload are never registered.

import type { DocumentLike, DocumentVisibilityState, PageContext, PageTransitionEventLike,
  WindowLike } from '@rhombus-std/hosting.browser';
import type { IHostApplicationLifetime } from '@rhombus-std/hosting.core';
import { AbortController, type AbortSignal } from '@rhombus-std/primitives';

type Listener = (event?: unknown) => void;

/** A recording EventTarget: registered types are inspectable, dispatch is manual. */
export class FakeEventTarget {
  readonly #listeners = new Map<string, Set<Listener>>();
  /** Every type ever passed to addEventListener, in order. */
  public readonly registeredTypes: string[] = [];

  public addEventListener(type: string, listener: Listener): void {
    this.registeredTypes.push(type);
    let set = this.#listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
  }

  public removeEventListener(type: string, listener: Listener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  public dispatch(type: string, event?: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }

  /** The number of currently attached listeners across all types. */
  public get listenerCount(): number {
    let count = 0;
    for (const set of this.#listeners.values()) {
      count += set.size;
    }
    return count;
  }
}

export class FakeDocument extends FakeEventTarget {
  public visibilityState: DocumentVisibilityState = 'visible';
}

export class FakeWindow extends FakeEventTarget {}

export interface FakePage {
  document: FakeDocument;
  window: FakeWindow;
  context: PageContext;
  /** Dispatches visibilitychange after setting document.visibilityState. */
  changeVisibility(state: DocumentVisibilityState): void;
  pageHide(persisted: boolean): void;
  pageShow(persisted: boolean): void;
}

export function makeFakePage(): FakePage {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const transition = (persisted: boolean): PageTransitionEventLike => {
    return { persisted };
  };
  return {
    document,
    window,
    context: {
      document: document as unknown as DocumentLike,
      window: window as unknown as WindowLike,
    },
    changeVisibility(state) {
      document.visibilityState = state;
      document.dispatch('visibilitychange');
    },
    pageHide(persisted) {
      window.dispatch('pagehide', transition(persisted));
    },
    pageShow(persisted) {
      window.dispatch('pageshow', transition(persisted));
    },
  };
}

/** A recording IHostApplicationLifetime whose signals are real AbortSignals. */
export class FakeApplicationLifetime implements IHostApplicationLifetime {
  readonly #started = new AbortController();
  readonly #stopping = new AbortController();
  readonly #stopped = new AbortController();
  public stopCalls = 0;

  public get applicationStarted(): AbortSignal {
    return this.#started.signal;
  }
  public get applicationStopping(): AbortSignal {
    return this.#stopping.signal;
  }
  public get applicationStopped(): AbortSignal {
    return this.#stopped.signal;
  }

  public stopApplication(): void {
    this.stopCalls += 1;
    this.#stopping.abort();
  }
}
