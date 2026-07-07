// ConfigurationSection -- a pure (root, path) view with zero independent
// storage, plus index-navigable dot/bracket access.
//
// Every read/write routes back through the owning ConfigurationRoot with the
// section's path combined onto the requested key, so a section is always a live
// window over the root's providers, never a snapshot.
//
// Index navigation (`config.Server.Port`) is provided by extending
// IndexAccessed: any property read that misses a real member routes to
// _getIndex, which returns a sub-section. REAL MEMBERS WIN over the indexer,
// so a config key that collides with a member name (`value`, `key`, `path`,
// `get`, `getNum`, `getBool`, `getSection`, `getChildren`, `toObject`, `set`,
// or any Object.prototype name) is UNREACHABLE via `config.X` -- reach it with
// `config.getSection("X")` instead.

import type { DeepRecord, IConfiguration, IConfigurationSection, IndexedSection } from "@rhombus-std/config.core";
import { IndexAccessed } from "@rhombus-toolkit/proxy-base";
import { combine, getSectionKey } from "./abstractions/configuration-path";
import { parseBoolean, parseNumber } from "./coerce";
import type { ConfigurationRoot } from "./configuration-root";

/**
 * A section of configuration values, identified by its full colon-delimited
 * {@link path} within the owning root. Constructed by
 * {@link ConfigurationRoot.getSection} / {@link IConfiguration.getSection};
 * never instantiated directly by consumers.
 */
export class ConfigurationSection extends IndexAccessed<IndexedSection> implements IConfigurationSection {
  readonly #root: ConfigurationRoot;
  readonly #path: string;
  #key?: string;

  public constructor(root: ConfigurationRoot, path: string) {
    super();
    this.#root = root;
    this.#path = path;
  }

  /** The last segment of this section's path -- its key within its parent. */
  public get key(): string {
    return (this.#key ??= getSectionKey(this.#path));
  }

  /** The full colon-delimited path to this section within the root. */
  public get path(): string {
    return this.#path;
  }

  /** The value stored directly at this section's path, if any. */
  public get value(): string | undefined {
    return this.#root.get(this.#path);
  }

  public set value(value: string) {
    this.#root.set(this.#path, value);
  }

  public get(path: string): string | undefined;
  public get<T>(path: string, factory: (value: string) => T): T | undefined;
  public get<T>(path: string, factory?: (value: string) => T): (string | T) | undefined {
    const raw = this.#root.get(combine(this.#path, path));
    if (raw === undefined) {
      return undefined;
    }
    return factory === undefined ? raw : factory(raw);
  }

  public getNum(path: string): number | undefined;
  public getNum(path: string, dflt: number): number;
  public getNum(path: string, dflt?: number): number | undefined {
    const raw = this.get(path);
    if (raw === undefined) {
      return dflt;
    }
    const r = parseNumber(raw);
    if (!r.ok) {
      throw new TypeError(`configuration key "${combine(this.#path, path)}" is ${r.reason}`);
    }
    return r.value;
  }

  public getBool(path: string): boolean | undefined;
  public getBool(path: string, dflt: boolean): boolean;
  public getBool(path: string, dflt?: boolean): boolean | undefined {
    const raw = this.get(path);
    if (raw === undefined) {
      return dflt;
    }
    const r = parseBoolean(raw);
    if (!r.ok) {
      throw new TypeError(`configuration key "${combine(this.#path, path)}" is ${r.reason}`);
    }
    return r.value;
  }

  /** Writes a descendant key relative to this section. */
  public set(key: string, value: string): this {
    this.#root.set(combine(this.#path, key), value);
    return this;
  }

  /** A sub-section relative to this section (never null). */
  public getSection(key: string): IConfigurationSection {
    return this.#root.getSection(combine(this.#path, key));
  }

  /** The immediate descendant sections of this section. */
  public getChildren(): Iterable<IConfigurationSection> {
    return this.#root.getChildrenImplementation(this.#path);
  }

  /** This section's subtree as a nested plain string object. */
  public toObject(): DeepRecord {
    return subtreeToObject(this);
  }

  protected _getIndex(key: PropertyKey): IndexedSection {
    // Symbol probes (Symbol.iterator/toStringTag/util.inspect.custom, ...)
    // reach here as misses -- never navigate for them.
    if (typeof key !== "string") {
      return undefined as unknown as IndexedSection;
    }
    // `getSection` never returns null, so an un-guarded `config.then` would look
    // thenable and corrupt `await config`. Guard it.
    if (key === "then") {
      return undefined as unknown as IndexedSection;
    }
    return this.getSection(key) as unknown as IndexedSection;
  }

  protected _setIndex(_key: PropertyKey, _value: IndexedSection): IndexedSection {
    throw new TypeError(
      "Configuration is read-only through index access; use set(key, value) or the value setter.",
    );
  }
}

/**
 * A node with children serializes as a record (its own scalar value, if any,
 * is dropped); a pure leaf serializes as its string value. Shared by both
 * ConfigurationSection and ConfigurationRoot.
 */
export function subtreeToObject(node: IConfiguration): DeepRecord {
  const out: Record<string, string | DeepRecord> = {};
  for (const child of node.getChildren()) {
    let hasChildren = false;
    for (const _grandchild of child.getChildren()) {
      hasChildren = true;
      break;
    }
    out[child.key] = hasChildren ? child.toObject() : (child.value ?? "");
  }
  return out;
}
