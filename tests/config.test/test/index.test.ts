// Public entry-point surface for @rhombus-std/config -- verifies the core symbols a
// consumer (and the provider packages) need are reachable off the barrel, that
// ConfigBuilder ships add() + withSchema() + build(), that the abstract
// ConfigProvider base is subclassable, and that a root builds and coerces
// end-to-end through the public entry point alone.

import { compareConfigKeys, ConfigBuilder, type ConfigObject, configPath, ConfigProvider, ConfigRoot, ConfigSection,
  type IConfig, type IConfigBuilder, type IConfigProvider, type IConfigRoot, type IConfigSection, type IConfigSource,
  type IndexedSection, type Infer, type ITryGetResult, MemoryConfigProvider, MemoryConfigSource, type ObjectSchema,
  OPTIONAL, type OptionalSchema, type Schema, SchemaCoercionError } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';

describe('public entry point', () => {
  test('exports the core value bindings a consumer and the provider packages need', () => {
    expect(ConfigBuilder).toBeDefined();
    expect(ConfigRoot).toBeDefined();
    expect(ConfigSection).toBeDefined();
    expect(ConfigProvider).toBeDefined();
    expect(typeof compareConfigKeys).toBe('function');
    expect(MemoryConfigSource).toBeDefined();
    expect(MemoryConfigProvider).toBeDefined();
    expect(SchemaCoercionError).toBeDefined();
    expect(typeof OPTIONAL).toBe('symbol');
    expect(configPath).toBeDefined();
    expect(configPath.combine('Server', 'Port')).toBe('Server:Port');
    expect(configPath.getSectionKey('Server:Port')).toBe('Port');
  });

  test('ConfigBuilder ships add() (returning this) plus build()', () => {
    const builder = new ConfigBuilder();
    const returned = builder.add(new MemoryConfigSource({ initialData: { A: '1' } }));

    // add() must return `this` for the augmentation pattern to type-check.
    expect(returned).toBe(builder);
    expect([...builder.sources].length).toBe(1);

    const root = builder.build();
    expect(root).toBeInstanceOf(ConfigRoot);
    expect(root.get('A')).toBe('1');
  });

  test('properties is a shared mutable bag a source can read at build() time', () => {
    const builder = new ConfigBuilder();

    // One Map instance for the builder's lifetime -- mutations are visible
    // through every later read of the getter.
    builder.properties.set('BasePath', '/etc/app');
    expect(builder.properties.get('BasePath')).toBe('/etc/app');
    expect(builder.properties).toBe(builder.properties);

    // A source observes the bag through the builder handed to build().
    let observed: unknown;
    class PropertiesReadingSource implements IConfigSource {
      public build(b: IConfigBuilder): IConfigProvider {
        observed = b.properties.get('BasePath');
        return new MemoryConfigProvider(new MemoryConfigSource());
      }
    }
    builder.add(new PropertiesReadingSource()).build();
    expect(observed).toBe('/etc/app');
  });

  test('sources are ordered-list semantics: registration order preserved, no reference dedup', () => {
    const builder = new ConfigBuilder();
    const a = new MemoryConfigSource({ initialData: { A: '1' } });
    const b = new MemoryConfigSource({ initialData: { B: '2' } });

    builder.add(a).add(b).add(a);

    // The same source instance registered twice is NOT silently deduplicated
    // (a Set would collapse this to length 2) -- sources are an ordered list.
    expect([...builder.sources]).toEqual([a, b, a]);
  });

  test('addInMemoryCollection augmentation is installed on the prototype', () => {
    const root = new ConfigBuilder()
      .addInMemoryCollection({ 'Server:Port': '8080' })
      .build();

    expect(root.get('Server:Port')).toBe('8080');
  });

  test('the abstract ConfigProvider base is subclassable by provider packages', () => {
    class FixedProvider extends ConfigProvider {
      public override load(): void {
        this.set('Fixed:Key', 'value');
      }
    }
    class FixedSource implements IConfigSource {
      public build(_builder: IConfigBuilder): IConfigProvider {
        return new FixedProvider();
      }
    }

    const root = new ConfigBuilder().add(new FixedSource()).build();
    // Loaded eagerly at construction, resolved case-insensitively.
    expect(root.get('fixed:key')).toBe('value');
  });

  test('end-to-end: build a typed, coerced config through the public entry point alone', () => {
    const typed = new ConfigBuilder()
      .addInMemoryCollection({ Host: 'localhost', Port: '8080' })
      .withSchema({ Host: 'string', Port: 'number' })
      .build();

    expect(typed).toEqual({ Host: 'localhost', Port: 8080 });
    // The generic threads through so `Port` is statically a number.
    const port: number = typed.Port;
    expect(port).toBe(8080);
  });

  test('type-only exports are usable in a type position', () => {
    // Compile-time-only assertions -- if any of these types stopped being
    // exported, this file would fail to type-check under `tsc --noEmit`.
    type _Config = IConfig;
    type _Root = IConfigRoot;
    type _Section = IConfigSection;
    type _Provider = IConfigProvider;
    type _Builder = IConfigBuilder;
    type _Source = IConfigSource;
    type _Try = ITryGetResult<string>;
    type _Deep = ConfigObject;
    type _Indexed = IndexedSection;
    type _Obj = ObjectSchema;
    type _Opt = OptionalSchema;
    // A concrete, non-recursive schema shape -- `Infer<Schema>` (the fully
    // recursive union `Schema` itself) sends `tsc` into TS2589; this exercises
    // `Infer` in a type position without that runaway recursion.
    type _Inferred = Infer<{ a: 'string'; b: { c: 'number'; }; }>;
    const _schema: Schema = 'string';
    expect(_schema).toBe('string');
  });
});
