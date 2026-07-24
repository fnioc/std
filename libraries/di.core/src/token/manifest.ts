// The typed-token REFERENCE manifest — a decorator-pattern manifest (a class
// wrapping an ordered descriptor list), a `seal()` that materialises the list via
// `toArray()` and splits it into the two frozen lookup indexes, and a provider
// whose `lookup` fast-paths exact hits, recovers whitespace/quote/number variance
// through canonicalisation, and synthesises closings of open templates by
// most-specific-wins unification.
//
// The live engine graduation kept the parts that preserve today's behavior;
// `TokenProvider`'s EXTRAS — `specificity` ranking / most-specific-wins,
// canon-on-miss variance recovery, negative memoization — stay GATED (they are
// behavior CHANGES) and live on only as this exercised reference for the
// still-gated features. Ported to the unified tree: it drives the same
// `TokenNode.*` statics + `Matcher` / `Substituter` / `Specificity` visitors the
// live path uses.

import { Matcher } from './match.js';
import type { TokenNode } from './node.js';
import { TokenNode as Tree } from './node.js';
import { Specificity } from './specificity.js';
import { Substituter } from './substitute.js';

/** One registration: the canonical token string, its parsed tree, the opaque
 * producer, the dependency signatures (positional node lists, substituted on
 * close), and an optional scope. */
export interface Descriptor<P> {
  readonly token: string;
  readonly tree: TokenNode;
  readonly producer: P;
  readonly signatures?: ReadonlyArray<readonly TokenNode[]>;
  readonly scope?: string;
}

/** The two frozen lookup indexes a sealed manifest exposes — the exact-string map
 * (last-wins per canonical token) and the template-by-base map (open templates
 * bucketed by their base, for open-generic synthesis). */
export interface SealedTokenManifest<P> {
  readonly exact: ReadonlyMap<string, ReadonlyArray<Descriptor<P>>>;
  readonly templates: ReadonlyMap<string, ReadonlyArray<Descriptor<P>>>;
}

/** The authoring-time builder: a decorator over an ordered descriptor list. Each
 * `add` canonicalises the token and pushes a descriptor; the list is the single
 * ordered source of truth, materialised by `toArray()` and split into indexes
 * only at `seal()`. */
export class TokenManifest<P> implements Iterable<Descriptor<P>> {
  readonly #descriptors: Array<Descriptor<P>> = [];

  public add(
    rawToken: string,
    producer: P,
    signatures?: ReadonlyArray<readonly TokenNode[]>,
    scope?: string,
  ): this {
    const tree = Tree.parse(rawToken);
    this.#descriptors.push({ token: Tree.toString(tree), tree, producer, signatures, scope });
    return this;
  }

  public [Symbol.iterator](): Iterator<Descriptor<P>> {
    return this.#descriptors[Symbol.iterator]();
  }

  public toArray(): Array<Descriptor<P>> {
    return [...this];
  }

  public seal(): SealedTokenManifest<P> {
    const exact = new Map<string, Array<Descriptor<P>>>();
    const templates = new Map<string, Array<Descriptor<P>>>();
    for (const descriptor of this.toArray()) {
      if (Tree.isOpen(descriptor.tree)) {
        bucket(templates, Tree.baseKey(descriptor.tree), descriptor);
      } else {
        bucket(exact, descriptor.token, descriptor);
      }
    }
    return Object.freeze({
      exact: freezeIndex(exact),
      templates: freezeIndex(templates),
    });
  }
}

function bucket<P>(index: Map<string, Array<Descriptor<P>>>, key: string, descriptor: Descriptor<P>): void {
  const list = index.get(key);
  if (list) {
    list.push(descriptor);
    return;
  }
  index.set(key, [descriptor]);
}

function freezeIndex<P>(index: Map<string, Array<Descriptor<P>>>): ReadonlyMap<string, ReadonlyArray<Descriptor<P>>> {
  for (const [key, list] of index) {
    index.set(key, Object.freeze(list) as Array<Descriptor<P>>);
  }
  return Object.freeze(index);
}

/** The resolution surface over a sealed manifest. `lookup` layers a fast path
 * (exact raw hit, no parse), a memo, whitespace/quote/number variance recovery
 * via canonicalisation, a base gate, and open-template synthesis. */
export class TokenProvider<P> {
  readonly #exact: ReadonlyMap<string, ReadonlyArray<Descriptor<P>>>;
  readonly #templates: ReadonlyMap<string, ReadonlyArray<Descriptor<P>>>;
  readonly #memo = new Map<string, Descriptor<P> | null>();
  readonly #matcher = new Matcher();
  readonly #specificity = new Specificity();

  public constructor(sealed: SealedTokenManifest<P>) {
    this.#exact = sealed.exact;
    this.#templates = sealed.templates;
  }

  public lookup(raw: string): Descriptor<P> | undefined {
    const exactHit = this.#exact.get(raw);
    if (exactHit) {
      return last(exactHit);
    }
    const memoed = this.#memo.get(raw);
    if (memoed !== undefined) {
      return memoed ?? undefined;
    }

    const tree = Tree.parse(raw);
    // An open (hole-bearing) query is not a resolvable closed token — miss.
    if (Tree.isOpen(tree)) {
      return this.#remember(raw, undefined);
    }
    const canon = Tree.toString(tree);
    if (canon !== raw) {
      const canonHit = this.#exact.get(canon);
      if (canonHit) {
        return this.#remember(raw, last(canonHit));
      }
    }

    if (tree.kind !== 'concrete' || !tree.args.length) {
      return this.#remember(raw, undefined);
    }
    const candidates = this.#templates.get(Tree.baseKey(tree));
    if (!candidates) {
      return this.#remember(raw, undefined);
    }

    const ranked = this.#rankTemplates(candidates);
    for (const template of ranked) {
      const bind = this.#matcher.match(template.tree, tree);
      if (bind) {
        const synthesised = this.#synthesise(template, canon, bind);
        this.#memo.set(canon, synthesised);
        return this.#remember(raw, synthesised);
      }
    }
    return this.#remember(raw, undefined);
  }

  #synthesise(template: Descriptor<P>, canon: string, bind: Map<number, TokenNode>): Descriptor<P> {
    const substituter = new Substituter(bind);
    return {
      token: canon,
      tree: Tree.parse(canon),
      producer: template.producer,
      signatures: template.signatures?.map((signature) => signature.map((slot) => substituter.rewrite(slot))),
      scope: template.scope,
    };
  }

  #remember(raw: string, result: Descriptor<P> | undefined): Descriptor<P> | undefined {
    this.#memo.set(raw, result ?? null);
    return result;
  }

  /** Rank overlapping templates most-specific-first, breaking ties by LATEST
   * registration (bucket order is registration order), so a later duplicate of a
   * template overrides an earlier one. */
  #rankTemplates(candidates: ReadonlyArray<Descriptor<P>>): Array<Descriptor<P>> {
    return candidates
      .map((descriptor, index) => ({ descriptor, index }))
      .sort((a, b) => {
        const bySpecificity = this.#specificity.measure(b.descriptor.tree)
          - this.#specificity.measure(a.descriptor.tree);
        if (bySpecificity !== 0) {
          return bySpecificity;
        }
        return b.index - a.index;
      })
      .map((entry) => entry.descriptor);
  }
}

function last<P>(list: ReadonlyArray<Descriptor<P>>): Descriptor<P> {
  return list[list.length - 1]!;
}
