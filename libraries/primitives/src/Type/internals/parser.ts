import type { ConstructorType, FunctionType, ObjectType, Type } from '../Type.js';
import { ctor, func, generic, global, importType, intersection, literal, object, tag, tuple,
  union } from './factories.js';
import { GLOBAL_QUALIFIER, KEYWORD_LITERALS, SERVICE_PROVIDER_FROM } from './grammar.js';
import { lex, type LexToken } from './lexer.js';
import { TypeParseError } from './TypeParseError.js';

const OPENERS = new Set(['(', '[', '{', '<']);
const CLOSERS = new Set([')', ']', '}', '>']);

/**
 * Reads a type token back into the {@link Type} it spells.
 *
 * @throws TypeParseError when the token is malformed.
 */
export function parseTypeString(token: string): Type {
  return new TypeParser(token).parse();
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
    const types: Type[] = [first];
    while (this.#take('|')) {
      types.push(this.#intersection());
    }
    return union(types);
  }

  #intersection(): Type {
    const first = this.#tagged();
    if (!this.#at('&')) {
      return first;
    }
    const types: Type[] = [first];
    while (this.#take('&')) {
      types.push(this.#tagged());
    }
    return intersection(types);
  }

  #tagged(): Type {
    let type = this.#primary();
    while (this.#take('#')) {
      if (type.kind === 'tag') {
        throw this.#error(this.#lexed[this.#index - 1]!.position, 'no second tag — a type wears at most one');
      }
      type = tag(type, this.#segment());
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
      return literal(token.value);
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
        return tuple(this.#typeList(']'));
      }
      case '{': {
        this.#index++;
        return object(this.#members());
      }
      case '%': {
        this.#index++;
        return generic(this.#segment());
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
      return first.text === GLOBAL_QUALIFIER ? global(name, genericArgs) : importType(name, first.text, genericArgs);
    }
    if (!first.escaped) {
      const reserved = this.#reserved(first);
      if (reserved) {
        return reserved;
      }
    }
    return global(first.text, this.#genericTypes());
  }

  /**
   * The readings an unescaped, unqualified name carries instead of naming a type. `string`,
   * `number` and the other value types are deliberately absent — they name types like any other.
   * The aggregate spellings are absent too: the global door canonicalizes them, so parsing one
   * as an ordinary name already lands on its kind node.
   */
  #reserved(name: LexToken): Type | undefined {
    if (KEYWORD_LITERALS.has(name.text)) {
      if (this.#at('<')) {
        throw this.#error(this.#peek()!.position, `no type arguments — \`${name.text}\` is a literal`);
      }
      return literal(KEYWORD_LITERALS.get(name.text));
    }
    switch (name.text) {
      case 'Func': {
        const [returnType, ...args] = this.#reservedArguments(name, 'Func<Return, ...Args>');
        return func(returnType!, args);
      }
      case 'Ctor': {
        const [instanceType, ...args] = this.#reservedArguments(name, 'Ctor<Instance, ...Args>');
        return ctor(instanceType!, args);
      }
      case 'ServiceProvider': {
        if (this.#at('<')) {
          throw this.#error(this.#peek()!.position, 'no type arguments — `ServiceProvider` names the provider itself');
        }
        return importType('IServiceProvider', SERVICE_PROVIDER_FROM, []);
      }
      default: {
        return undefined;
      }
    }
  }

  #reservedArguments(name: LexToken, spelling: string): readonly Type[] {
    const types = this.#genericTypes();
    if (!types.length) {
      throw this.#error(name.position, `\`${spelling}\``);
    }
    return types;
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
    const entries: [string, Type][] = [];
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

  #atCtor(): boolean {
    const token = this.#peek();
    return token?.kind === 'name' && !token.escaped && token.text === 'new'
      && this.#lexed[this.#index + 1]?.text === '(';
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
    const args = this.#typeList(')');
    this.#expect('=>');
    return func(this.#type(), args);
  }

  #ctor(): ConstructorType {
    this.#index++;
    this.#expect('(');
    const args = this.#typeList(')');
    this.#expect('=>');
    return ctor(this.#type(), args);
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
