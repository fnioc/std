// SPIKE (§ open-generic token redesign, additive). The registration surface on
// top of the typed token model in `./token.ts`: a decorator-pattern manifest
// (a class wrapping an ordered descriptor list), a `seal()` that materialises
// the list via `toArray()` and splits it into the two frozen lookup indexes,
// and a provider whose `lookup` fast-paths exact hits, recovers whitespace /
// quote / number variance through canonicalisation, and synthesises closings
// of open templates by most-specific-wins unification.
//
// The `SealedTokenManifest` shape (an exact string-map + a template-by-base map)
// mirrors the redesign target for `di.core`'s real `SealedManifest`, so the
// spike is a bankable foundation the engine could later consume unchanged.

import { baseKey, isOpen, match, parse, specificity, stringify, substituteSignature, type Token } from './token.js';

/** One registration: the canonical token string, its parsed tree, the opaque
 * producer (class / factory / value — the spike is producer-agnostic), the
 * dependency signatures (positional token lists, substituted on close), and an
 * optional scope. */
export interface Descriptor<P> {
  readonly token: string;
  readonly tree: Token;
  readonly producer: P;
  readonly signatures?: readonly (readonly Token[])[];
  readonly scope?: string;
}

/** The two frozen lookup indexes a sealed manifest exposes — the exact-string
 * map (last-wins per canonical token) and the template-by-base map (open
 * templates bucketed by their base, for open-generic synthesis). */
export interface SealedTokenManifest<P> {
  readonly exact: ReadonlyMap<string, readonly Descriptor<P>[]>;
  readonly templates: ReadonlyMap<string, readonly Descriptor<P>[]>;
}

/** The authoring-time builder: a decorator over an ordered descriptor list.
 * Each `add` canonicalises the token and pushes a descriptor; the list is the
 * single ordered source of truth (no eager index maps), materialised by
 * `toArray()` and split into indexes only at `seal()`. */
export class TokenManifest<P> implements Iterable<Descriptor<P>> {
  readonly #descriptors: Descriptor<P>[] = [];

  public add(
    rawToken: string,
    producer: P,
    signatures?: readonly (readonly Token[])[],
    scope?: string,
  ): this {
    const tree = parse(rawToken);
    this.#descriptors.push({ token: stringify(tree), tree, producer, signatures, scope });
    return this;
  }

  public [Symbol.iterator](): Iterator<Descriptor<P>> {
    return this.#descriptors[Symbol.iterator]();
  }

  public toArray(): Descriptor<P>[] {
    return [...this];
  }

  public seal(): SealedTokenManifest<P> {
    const exact = new Map<string, Descriptor<P>[]>();
    const templates = new Map<string, Descriptor<P>[]>();
    for (const descriptor of this.toArray()) {
      if (isOpen(descriptor.tree)) {
        bucket(templates, baseKey(descriptor.tree), descriptor);
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

function bucket<P>(index: Map<string, Descriptor<P>[]>, key: string, descriptor: Descriptor<P>): void {
  const list = index.get(key);
  if (list) {
    list.push(descriptor);
    return;
  }
  index.set(key, [descriptor]);
}

function freezeIndex<P>(index: Map<string, Descriptor<P>[]>): ReadonlyMap<string, readonly Descriptor<P>[]> {
  for (const [key, list] of index) {
    index.set(key, Object.freeze(list) as Descriptor<P>[]);
  }
  return Object.freeze(index);
}

/** The resolution surface over a sealed manifest. `lookup` layers a fast path
 * (exact raw hit, no parse), a memo, whitespace/quote/number variance recovery
 * via canonicalisation, a base gate, and open-template synthesis. */
export class TokenProvider<P> {
  readonly #exact: ReadonlyMap<string, readonly Descriptor<P>[]>;
  readonly #templates: ReadonlyMap<string, readonly Descriptor<P>[]>;
  readonly #memo = new Map<string, Descriptor<P> | null>();

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

    const tree = parse(raw);
    const canon = stringify(tree);
    if (canon !== raw) {
      const canonHit = this.#exact.get(canon);
      if (canonHit) {
        return this.#remember(raw, last(canonHit));
      }
    }

    if (tree.kind !== 'concrete' || !tree.args.length) {
      return this.#remember(raw, undefined);
    }
    const candidates = this.#templates.get(baseKey(tree));
    if (!candidates) {
      return this.#remember(raw, undefined);
    }

    const ranked = [...candidates].sort((a, b) => specificity(b.tree) - specificity(a.tree));
    for (const template of ranked) {
      const bind = match(template.tree, tree);
      if (bind) {
        const synthesised = this.#synthesise(template, canon, bind);
        this.#memo.set(canon, synthesised);
        return this.#remember(raw, synthesised);
      }
    }
    return this.#remember(raw, undefined);
  }

  #synthesise(template: Descriptor<P>, canon: string, bind: Map<number, Token>): Descriptor<P> {
    return {
      token: canon,
      tree: parse(canon),
      producer: template.producer,
      signatures: template.signatures?.map((signature) => substituteSignature(signature, bind)),
      scope: template.scope,
    };
  }

  #remember(raw: string, result: Descriptor<P> | undefined): Descriptor<P> | undefined {
    this.#memo.set(raw, result ?? null);
    return result;
  }
}

function last<P>(list: readonly Descriptor<P>[]): Descriptor<P> {
  return list[list.length - 1]!;
}
