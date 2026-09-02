import type { Behavior, ControlService, Handle, Registration } from '@rhombus-std/di.core';

/**
 * One installed behavior as the dispatcher reads it. The per-hook flags are read once at install:
 * absent when the hook is, else whether it is middleware (declared above the handler's arity).
 */
export interface Entry {
  readonly behavior: Partial<Behavior>;
  /** Gated: the hooks run only for an ask that activated this entry's handle. */
  readonly staged: boolean;
  readonly beginResolve?: boolean;
  readonly beforeConstruct?: boolean;
  readonly canonicalize?: boolean;
  readonly afterConstruct?: boolean;
}

/** One always-active hook: the entry and the state slot its behavior threads. */
export interface AlwaysHook {
  readonly slot: number;
  readonly entry: Entry;
}

/**
 * The always-active dispatch, precomputed once per install or dispose: per hook kind, the
 * participating entries in install order, so the ask path walks only what can run and skips
 * every kind nobody implements.
 */
export interface AlwaysDispatch {
  /** How many always-active entries there are; their state slots are `0..count-1` in install order. */
  readonly count: number;
  readonly beginResolve: readonly AlwaysHook[];
  readonly beforeConstruct: readonly AlwaysHook[];
  readonly canonicalize: readonly AlwaysHook[];
  readonly afterConstruct: readonly AlwaysHook[];
}

const EMPTY_ALWAYS: AlwaysDispatch = { count: 0, beginResolve: [], beforeConstruct: [], canonicalize: [], afterConstruct: [] };

/**
 * The engine's installed behaviors — its `ControlService` implementation, one per engine.
 *
 * @remarks
 * Install and dispose are cold: each rebuilds {@link always} once, so nothing on the ask path
 * installs, splices or checks for removal. The entry list only grows; disposing a handle empties
 * its slot and never reuses it, so a request still naming the handle simply fails its gate.
 */
export class InstalledHooks implements ControlService {
  readonly registry: Iterable<Registration<unknown>>;
  readonly #entries: Array<Entry | undefined> = [];
  #always: AlwaysDispatch = EMPTY_ALWAYS;

  constructor(registry: Iterable<Registration<unknown>>) {
    this.registry = registry;
  }

  /**
   * The current always-active dispatch — an immutable snapshot, replaced whole by install and
   * dispose, so an ask that captured one keeps it.
   */
  get always(): AlwaysDispatch {
    return this.#always;
  }

  /** The entry at an activated handle's slot; `undefined` once the handle is disposed. */
  entryAt(index: number): Entry | undefined {
    return this.#entries[index];
  }

  stageHooks(hooks: Partial<Behavior>): Handle {
    return this.#install(hooks, true);
  }

  installHooks(hooks: Partial<Behavior>): Handle {
    return this.#install(hooks, false);
  }

  #install(behavior: Partial<Behavior>, staged: boolean): Handle {
    const index = this.#entries.length;
    this.#entries.push({
      behavior,
      staged,
      beginResolve: middlewareArity(behavior.beginResolve, 2),
      beforeConstruct: middlewareArity(behavior.beforeConstruct, 1),
      canonicalize: middlewareArity(behavior.canonicalize, 2),
      afterConstruct: middlewareArity(behavior.afterConstruct, 2),
    });
    if (!staged) {
      this.#rebuildAlways();
    }
    return {
      index,
      [Symbol.dispose]: () => {
        const entry = this.#entries[index];
        if (entry === undefined) {
          return;
        }
        this.#entries[index] = undefined;
        if (!entry.staged) {
          this.#rebuildAlways();
        }
      },
    };
  }

  #rebuildAlways(): void {
    const beginResolve: AlwaysHook[] = [];
    const beforeConstruct: AlwaysHook[] = [];
    const canonicalize: AlwaysHook[] = [];
    const afterConstruct: AlwaysHook[] = [];
    let count = 0;
    for (const entry of this.#entries) {
      if (entry === undefined || entry.staged) {
        continue;
      }
      const slot = count++;
      if (entry.beginResolve !== undefined) {
        beginResolve.push({ slot, entry });
      }
      if (entry.beforeConstruct !== undefined) {
        beforeConstruct.push({ slot, entry });
      }
      if (entry.canonicalize !== undefined) {
        canonicalize.push({ slot, entry });
      }
      if (entry.afterConstruct !== undefined) {
        afterConstruct.push({ slot, entry });
      }
    }
    this.#always = { count, beginResolve, beforeConstruct, canonicalize, afterConstruct };
  }
}

/** Whether the hook is declared as middleware — more parameters than its handler form takes. */
function middlewareArity(hook: { readonly length: number; } | undefined, handlerArity: number): boolean | undefined {
  return hook === undefined ? undefined : hook.length > handlerArity;
}
