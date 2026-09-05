// The Tier 1 schema walker: withSchema(...).build() coerces the config into a
// typed POJO, or throws an aggregating SchemaCoercionError.
//
// A schema is a `Type` tree. The type argument on withSchema states the shape to
// the compiler; the tree states the same shape at runtime. `bun test` type-checks
// nothing, so the static half of that pairing is held by the package's `lint`
// script (`tsc -p tsconfig.json`, which includes test/**/*).

import { ConfigBuilder, SchemaCoercionError } from '@rhombus-std/config';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const str = Type.global('string');
const num = Type.global('number');
const bool = Type.global('boolean');

/** A member the configuration may leave out. */
function optional(type: Type): Type {
  return Type.union(type, Type.typeLiteral(undefined));
}

interface ServerSection {
  Server: { Host: string; Port: number; Ssl?: boolean; };
}

describe('withSchema(...).build()', () => {
  test('coerces leaves and threads the named type', () => {
    const config = new ConfigBuilder().addInMemoryCollection({ 'Server:Host': 'h', 'Server:Port': '8080', 'Server:Ssl': 'on' }).withSchema<ServerSection>(
      Type.object({ Server: Type.object({ Host: str, Port: num, Ssl: optional(bool) }) }),
    ).build();

    expect(config).toEqual({ Server: { Host: 'h', Port: 8080, Ssl: true } });
    // Static: Port is a number, Ssl is boolean | undefined.
    const port: number = config.Server.Port;
    expect(port).toBe(8080);
  });

  test('an absent optional leaf coerces to undefined without raising an issue', () => {
    const config = new ConfigBuilder().addInMemoryCollection({ Host: 'h', Port: '1' }).withSchema(
      Type.object({ Host: str, Port: num, Ssl: optional(bool) }),
    ).build();

    expect(config).toEqual({ Host: 'h', Port: 1, Ssl: undefined });
  });

  test('a missing required leaf throws SchemaCoercionError naming the path', () => {
    const schema = Type.object({ Host: str, Port: num });

    expect(() => new ConfigBuilder().addInMemoryCollection({ Port: '1' }).withSchema(schema).build())
      .toThrow(SchemaCoercionError);

    try {
      new ConfigBuilder().addInMemoryCollection({ Port: '1' }).withSchema(schema).build();
    } catch (err) {
      expect((err as SchemaCoercionError).issues.some((i) => i.includes('Host'))).toBe(true);
    }
  });

  test('aggregates a missing top-level key AND a bad deep number into one throw', () => {
    try {
      new ConfigBuilder().addInMemoryCollection({ 'Server:Db:Pool': 'not-a-number' }).withSchema(
        Type.object({ Host: str, Server: Type.object({ Db: Type.object({ Pool: num }) }) }),
      ).build();
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaCoercionError);
      const issues = (err as SchemaCoercionError).issues;
      expect(issues.length).toBe(2);
      expect(issues.some((i) => i.includes('Host'))).toBe(true);
      expect(issues.some((i) => i.includes('Server:Db:Pool') && i.includes('not-a-number'))).toBe(true);
    }
  });

  test('coerces nested objects', () => {
    const config = new ConfigBuilder().addInMemoryCollection({ 'Database:Primary:Host': 'db', 'Database:Primary:PoolSize': '10' }).withSchema<
      { Database: { Primary: { Host: string; PoolSize: number; }; }; }
    >(
      Type.object({ Database: Type.object({ Primary: Type.object({ Host: str, PoolSize: num }) }) }),
    ).build();

    expect(config.Database.Primary.PoolSize).toBe(10);
  });

  test('resolves schema keys case-insensitively against the store', () => {
    const config = new ConfigBuilder().addInMemoryCollection({ PORT: '8080' }).withSchema(
      Type.object({ Port: num }),
    ).build();

    expect(config).toEqual({ Port: 8080 });
  });

  test('a member naming a type no configuration value coerces into is reported, not guessed at', () => {
    try {
      new ConfigBuilder().addInMemoryCollection({ When: '2026-01-01' }).withSchema(
        Type.object({ When: Type.global('Date') }),
      ).build();
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaCoercionError);
      expect((err as SchemaCoercionError).issues[0]).toContain('When');
    }
  });

  test('a member unioning two coercible leaves is reported -- one value cannot be both', () => {
    try {
      new ConfigBuilder().addInMemoryCollection({ Mode: 'fast' }).withSchema(
        Type.object({ Mode: Type.union(str, num) }),
      ).build();
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaCoercionError);
      expect((err as SchemaCoercionError).issues[0]).toContain('Mode');
    }
  });

  test('optionality survives an alternative being dropped -- what is left is still a union', () => {
    const config = new ConfigBuilder().addInMemoryCollection({ Host: 'h' }).withSchema(
      Type.object({ Host: str, Mode: Type.union(str, num, Type.typeLiteral(undefined)) }),
    ).build();

    expect(config).toEqual({ Host: 'h', Mode: undefined });
  });

  test('a member typed as a union of string literals coerces by equality', () => {
    const schema = Type.object({ Mode: Type.union(Type.typeLiteral('fast'), Type.typeLiteral('slow')) });

    const config = new ConfigBuilder().addInMemoryCollection({ Mode: 'fast' }).withSchema(schema).build();

    expect(config).toEqual({ Mode: 'fast' });
  });

  test('a member typed as a union of number/boolean/bigint literals coerces by parse-then-equality', () => {
    const schema = Type.object({
      Level: Type.union(Type.typeLiteral(1), Type.typeLiteral(2), Type.typeLiteral(3)),
      Strict: Type.union(Type.typeLiteral(true), Type.typeLiteral(false)),
      Big: Type.union(Type.typeLiteral(10n), Type.typeLiteral(20n)),
    });

    const config = new ConfigBuilder().addInMemoryCollection({ Level: '2', Strict: 'on', Big: '20' })
      .withSchema(schema).build();

    expect(config).toEqual({ Level: 2, Strict: true, Big: 20n });
  });

  test('a literal-union member survives being unioned with undefined -- optional, still literal-checked', () => {
    const schema = Type.object({
      Mode: Type.union(Type.typeLiteral('fast'), Type.typeLiteral('slow'), Type.typeLiteral(undefined)),
    });

    const absent = new ConfigBuilder().addInMemoryCollection({}).withSchema(schema).build();
    expect(absent).toEqual({ Mode: undefined });

    expect(() => new ConfigBuilder().addInMemoryCollection({ Mode: 'medium' }).withSchema(schema).build()).toThrow(
      SchemaCoercionError,
    );
  });

  test('a value naming no allowed literal is reported with the allowed values, not guessed at', () => {
    const schema = Type.object({ Mode: Type.union(Type.typeLiteral('fast'), Type.typeLiteral('slow')) });

    try {
      new ConfigBuilder().addInMemoryCollection({ Mode: 'medium' }).withSchema(schema).build();
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaCoercionError);
      const issue = (err as SchemaCoercionError).issues[0]!;
      expect(issue).toContain('Mode');
      expect(issue).toContain('"fast"');
      expect(issue).toContain('"slow"');
    }
  });
});
