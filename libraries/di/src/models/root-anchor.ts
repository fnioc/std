import type { IServiceProvider, Middleware } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import type { AbstractCtor, Func } from '@rhombus-toolkit/func';
import type { Scope } from './Scope.js';
import { resolvesFrom, ScopeBinding } from './ScopeBinding.js';

/** A model's root anchor: the middleware planting `root`, and how any ask finds the scope it opens a child under. */
export interface RootAnchor<S extends Scope> {
  /** Plants `root` over whatever this container resolves through; every later ask carries its keeping. */
  readonly middleware: Middleware;
  /** The scope `container` resolves from, when this anchor minted it — `root` otherwise. */
  enclosingScope(container: IServiceProvider): S;
  /** Opens `child`, nested inside the same chain {@link middleware} planted `root` over. */
  openChild(child: S): IServiceProvider;
}

/**
 * Anchors a lifetime model on `root`: the plumbing common to every model whose scopes nest —
 * minting the root once, at build, and answering where a later ask sits relative to it.
 */
export function anchorRoot<S extends Scope>(kind: AbstractCtor<any[], S>, root: S): RootAnchor<S> {
  let next!: Func<[Type], unknown>;
  const middleware: Middleware = nextIn => {
    next = nextIn;
    return new ScopeBinding(next, root).dispatch;
  };
  return {
    middleware,
    enclosingScope: container => resolvesFrom(container, kind) ?? root,
    openChild: child => new ScopeBinding(next, child).face,
  };
}
