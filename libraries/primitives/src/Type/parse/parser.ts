import { TypeParseError } from '../../TypeParseError.js';
import { GLOBAL_QUALIFIER, isListName, KEYWORD_LITERALS, SERVICE_PROVIDER_FROM } from '../grammar.js';
import type { AbstractConstructorType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, ObjectType, TagType, TupleType, Type, TypeLiteralType,
  UnionType } from '../Type.js';
import { lex, type LexToken } from './lexer.js';

const OPENERS = new Set(['(', '[', '{', '<']);
const CLOSERS = new Set([')', ']', '}', '>']);

/**
 * Reads a type token into the plain node tree it spells, exactly as written: grammar only, with
 * nothing canonicalized, collapsed or interned. {@link Type.adopt} is where the tree gains meaning.
 *
 * @throws TypeParseError when the token is malformed.
 */
export function parseLiteral(token: string): Type.RawType {
  return new TypeParser(token).parse();
}

/**
 * A parsed node, typed as the slot it fills. The brand it lacks is phantom, so nothing is forged
 * here: every node the parser builds is raw, and the tree is real only once adopted.
 */
function rawNode<T extends Type>(node: Type.RawType<T>): T {
  return node as unknown as T;
}

/** A callable's signatures slot: one row is the row itself, several are their union. */
function signatureSlot(rows: readonly TupleType[]): TupleType | UnionType {
  return rows.length === 1 ? rows[0]! : rawNode<UnionType>({ kind: 'union', members: rows });
}

/**
 * Recursive descent over the token's lexemes, loosest-binding production first:
 * arrow → union → intersection → tag → primary.
 */
class TypeParser {
  readonly #token: string;
  readonly #lexed: readonly LexToken[];
  #index = 0;

  constructor(token: string) {
    this.#token = token;
    this.#lexed = [...lex(token)];
  }

  public parse(): Type {
    const type = this.#type();
    const trailing = this.#peek();
    if (trailing) {
      throw this.#error(trailing.position, `nothing after the complete type, but '${trailing.text}' follows`);
    }
    return type;
  }

  #type(): Type {
    if (this.#atCtor()) {
      return this.#ctor();
    }
    if (this.#atArrow()) {
      return this.#function();
    }
    return this.#union();
  }

  #union(): Type {
    const first = this.#intersection();
    if (!this.#at('|')) {
      return first;
    }
    const members: Type[] = [first];
    while (this.#take('|')) {
      members.push(this.#intersection());
    }
    return rawNode<UnionType>({ kind: 'union', members });
  }

  #intersection(): Type {
    const first = this.#tagged();
    if (!this.#at('&')) {
      return first;
    }
    const members: Type[] = [first];
    while (this.#take('&')) {
      members.push(this.#tagged());
    }
    return rawNode<IntersectionType>({ kind: 'intersection', members });
  }

  #tagged(): Type {
    let type = this.#primary();
    while (this.#take('#')) {
      if (type.kind === 'tag') {
        throw this.#error(this.#lexed[this.#index - 1]!.position, 'no second tag — a type wears at most one');
      }
      type = rawNode<TagType>({ kind: 'tag', tag: this.#segment(), type });
    }
    return type;
  }

  #primary(): Type {
    const token = this.#peek();
    if (!token) {
      throw this.#error(this.#token.length, 'a type');
    }
    if (token.kind === 'literal') {
      this.#index++;
      return rawNode<TypeLiteralType>({ kind: 'literal', value: token.value });
    }
    if (token.kind === 'name') {
      return this.#named();
    }
    switch (token.text) {
      case '(': {
        this.#index++;
        const grouped = this.#type();
        this.#expect(')');
        return grouped;
      }
      case '[': {
        this.#index++;
        return this.#tuple();
      }
      case '{': {
        this.#index++;
        return rawNode<ObjectType>({ kind: 'object', members: this.#members() });
      }
      case '%': {
        this.#index++;
        return rawNode<GenericType>({ kind: 'generic', label: this.#segment() });
      }
      default: {
        throw this.#error(token.position, 'a type');
      }
    }
  }

  /** An unqualified name is a global one, as is the `global` qualifier written out. */
  #named(): Type {
    const first = this.#next();
    if (this.#take(':')) {
      const name = this.#segment();
      const genericArgs = this.#genericTypes();
      return first.text === GLOBAL_QUALIFIER
        ? rawNode<GlobalType>({ kind: 'global', name, genericArgs })
        : rawNode<ImportedType>({ kind: 'imported', name, from: first.text, genericArgs });
    }
    if (!first.escaped) {
      const reserved = this.#reserved(first);
      if (reserved) {
        return reserved;
      }
    }
    return rawNode<GlobalType>({ kind: 'global', name: first.text, genericArgs: this.#genericTypes() });
  }

  /**
   * The readings an unescaped, unqualified name carries instead of naming a type. `string`,
   * `number` and the other value types are deliberately absent — they name types like any other.
   * The list spellings are absent too: they parse as ordinary global names, and adoption lands
   * them on their own kind.
   */
  #reserved(name: LexToken): Type | undefined {
    if (Object.hasOwn(KEYWORD_LITERALS, name.text)) {
      if (this.#at('<')) {
        throw this.#error(this.#peek()!.position, `no type arguments — \`${name.text}\` is a literal`);
      }
      return rawNode<TypeLiteralType>({ kind: 'literal', value: KEYWORD_LITERALS[name.text] });
    }
    switch (name.text) {
      case 'Func': {
        const [returns, signatures] = this.#reservedSignature(name, 'Func<Return, ...Args>');
        return rawNode<FunctionType>({ kind: 'func', signatures, return: returns });
      }
      case 'Ctor': {
        const [instance, signatures] = this.#reservedSignature(name, 'Ctor<Instance, ...Args>');
        return rawNode<ConstructorType>({ kind: 'ctor', signatures, instance });
      }
      case 'ServiceProvider': {
        if (this.#at('<')) {
          throw this.#error(this.#peek()!.position, 'no type arguments — `ServiceProvider` names the provider itself');
        }
        return rawNode<ImportedType>({ kind: 'imported', name: 'IServiceProvider', from: SERVICE_PROVIDER_FROM, genericArgs: [] });
      }
      default: {
        return undefined;
      }
    }
  }

  /**
   * A reserved signature spelling's arguments: the return or instance type, then the
   * signatures — `Ctor<Instance, A, B; C>`. The head is separated from the first signature by the same comma
   * every other argument uses, so a one-signature spelling reads as one flat list.
   */
  #reservedSignature(name: LexToken, spelling: string): [head: Type, slot: TupleType | UnionType] {
    if (!this.#take('<')) {
      throw this.#error(name.position, `\`${spelling}\``);
    }
    if (this.#take('>')) {
      throw this.#error(this.#lexed[this.#index - 1]!.position, 'at least one type argument');
    }
    const head = this.#type();
    if (this.#take('>')) {
      return [head, this.#fixedTuple([])];
    }
    if (this.#take(';')) {
      return [head, signatureSlot([this.#fixedTuple([]), ...this.#signatureRows('>')])];
    }
    this.#expect(',');
    return [head, signatureSlot(this.#signatureRows('>'))];
  }

  #genericTypes(): readonly Type[] {
    if (!this.#take('<')) {
      return [];
    }
    const types = this.#typeList('>');
    if (!types.length) {
      throw this.#error(this.#lexed[this.#index - 1]!.position, 'at least one type argument');
    }
    return types;
  }

  /**
   * A callable's signatures up to `closer`: semicolon-separated signatures, each a comma-separated
   * list of types. An empty list is ONE empty signature — a callable taking no args, rather than
   * one answering to no call.
   */
  #signatureRows(closer: string): TupleType[] {
    const rows: TupleType[] = [];
    for (;;) {
      rows.push(this.#signature(closer));
      if (this.#take(closer)) {
        return rows;
      }
      this.#expect(';');
    }
  }

  /**
   * One signature, stopping at its `;` or at `closer` without consuming either: a tuple of the
   * fixed arg types, its rest slot the element of a trailing `...` list.
   */
  #signature(closer: string): TupleType {
    const members: Type[] = [];
    if (this.#at(closer) || this.#at(';')) {
      return this.#fixedTuple(members);
    }
    for (;;) {
      if (this.#take('...')) {
        const rest = this.#restElement();
        if (!(this.#at(closer) || this.#at(';'))) {
          throw this.#error(this.#peek()?.position ?? this.#token.length, 'the signature to end — a rest slot comes last');
        }
        return rawNode<TupleType>({ kind: 'tuple', members, rest });
      }
      members.push(this.#type());
      if (this.#at(closer) || this.#at(';')) {
        return this.#fixedTuple(members);
      }
      this.#expect(',');
    }
  }

  /** The element of the list a `...` slot draws from — the one argument of a list spelling. */
  #restElement(): Type {
    const position = this.#peek()?.position ?? this.#token.length;
    const list = this.#type();
    if (list.kind !== 'global' || !isListName(list.name) || list.genericArgs.length !== 1) {
      throw this.#error(position, 'a list type after `...`');
    }
    return list.genericArgs[0]!;
  }

  /** A tuple's slot list: fixed members, then at most one rest (`...List<T>`) slot, which comes last. */
  #tuple(): TupleType {
    const members: Type[] = [];
    if (this.#take(']')) {
      return this.#fixedTuple(members);
    }
    for (;;) {
      if (this.#take('...')) {
        const rest = this.#restElement();
        this.#expect(']');
        return rawNode<TupleType>({ kind: 'tuple', members, rest });
      }
      members.push(this.#type());
      if (this.#take(']')) {
        return this.#fixedTuple(members);
      }
      this.#expect(',');
    }
  }

  #fixedTuple(members: readonly Type[]): TupleType {
    return rawNode<TupleType>({ kind: 'tuple', members, rest: undefined });
  }

  #typeList(closer: string): readonly Type[] {
    const types: Type[] = [];
    if (this.#take(closer)) {
      return types;
    }
    for (;;) {
      types.push(this.#type());
      if (this.#take(closer)) {
        return types;
      }
      this.#expect(',');
    }
  }

  #members(): ObjectType['members'] {
    const entries: Array<[string, Type]> = [];
    if (this.#take('}')) {
      return Object.fromEntries(entries);
    }
    for (;;) {
      const key = this.#segment();
      this.#expect(':');
      entries.push([key, this.#type()]);
      if (this.#take('}')) {
        return Object.fromEntries(entries);
      }
      this.#expect(';');
    }
  }

  #segment(): string {
    return this.#next().text;
  }

  /** True at `new (` or the abstract-constructor spelling `abstract new (`. */
  #atCtor(): boolean {
    const offset = this.#atName('abstract') ? 1 : 0;
    const marker = this.#lexed[this.#index + offset];
    return marker?.kind === 'name' && !marker.escaped && marker.text === 'new'
      && this.#lexed[this.#index + offset + 1]?.text === '(';
  }

  /** An open paren begins a function type only when the group it opens is followed by `=>`. */
  #atArrow(): boolean {
    if (!this.#at('(')) {
      return false;
    }
    let depth = 0;
    for (let scan = this.#index; scan < this.#lexed.length; scan++) {
      const token = this.#lexed[scan]!;
      if (token.kind !== 'punct') {
        continue;
      }
      if (OPENERS.has(token.text)) {
        depth++;
      } else if (CLOSERS.has(token.text)) {
        depth--;
        if (!depth) {
          return this.#lexed[scan + 1]?.text === '=>';
        }
      }
    }
    return false;
  }

  #function(): FunctionType {
    this.#expect('(');
    const signatures = signatureSlot(this.#signatureRows(')'));
    this.#expect('=>');
    return rawNode<FunctionType>({ kind: 'func', signatures, return: this.#type() });
  }

  #ctor(): ConstructorType | AbstractConstructorType {
    const abstract = this.#takeName('abstract');
    this.#index++;
    this.#expect('(');
    const signatures = signatureSlot(this.#signatureRows(')'));
    this.#expect('=>');
    const instance = this.#type();
    return abstract
      ? rawNode<AbstractConstructorType>({ kind: 'abstract-ctor', signatures, instance })
      : rawNode<ConstructorType>({ kind: 'ctor', signatures, instance });
  }

  #peek(): LexToken | undefined {
    return this.#lexed[this.#index];
  }

  #next(): LexToken {
    const token = this.#peek();
    if (!token) {
      throw this.#error(this.#token.length, 'a name');
    }
    if (token.kind !== 'name') {
      throw this.#error(token.position, 'a name');
    }
    this.#index++;
    return token;
  }

  /** True at an unescaped name reading exactly `text` — a contextual keyword check. */
  #atName(text: string): boolean {
    const token = this.#peek();
    return token?.kind === 'name' && !token.escaped && token.text === text;
  }

  #takeName(text: string): boolean {
    if (!this.#atName(text)) {
      return false;
    }
    this.#index++;
    return true;
  }

  #at(punctuation: string): boolean {
    const token = this.#peek();
    return token?.kind === 'punct' && token.text === punctuation;
  }

  #take(punctuation: string): boolean {
    if (!this.#at(punctuation)) {
      return false;
    }
    this.#index++;
    return true;
  }

  #expect(punctuation: string): void {
    if (!this.#take(punctuation)) {
      throw this.#error(this.#peek()?.position ?? this.#token.length, `\`${punctuation}\``);
    }
  }

  #error(position: number, expectation: string): TypeParseError {
    return new TypeParseError(this.#token, position, expectation);
  }
}
