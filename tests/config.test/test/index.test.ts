// Public entry-point surface for @rhombus-std/config -- verifies the core symbols a
// consumer (and the provider packages) need are reachable off the barrel, that
// ConfigurationBuilder ships add() + withSchema() + build(), that the abstract
// ConfigurationProvider base is subclassable, and that a root builds and coerces
// end-to-end through the public entry point alone.

import {
  compareConfigurationKeys,
  type ConfigObject,
  configPath,
  ConfigurationBuilder,
  ConfigurationProvider,
  ConfigurationRoot,
  ConfigurationSection,
  type IConfiguration,
  type IConfigurationBuilder,
  type IConfigurationProvider,
  type IConfigurationRoot,
  type IConfigurationSection,
  type IConfigurationSource,
  type IndexedSection,
  type Infer,
  type ITryGetResult,
  MemoryConfigurationProvider,
  MemoryConfigurationSource,
  type ObjectSchema,
  OPTIONAL,
  type OptionalSchema,
  type Schema,
  SchemaCoercionError,
} from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

describe("public entry point", () => {
  test("exports the core value bindings a consumer and the provider packages need", () => {
    expect(ConfigurationBuilder).toBeDefined();
    expect(ConfigurationRoot).toBeDefined();
    expect(ConfigurationSection).toBeDefined();
    expect(ConfigurationProvider).toBeDefined();
    expect(typeof compareConfigurationKeys).toBe("function");
    expect(MemoryConfigurationSource).toBeDefined();
    expect(MemoryConfigurationProvider).toBeDefined();
    expect(SchemaCoercionError).toBeDefined();
    expect(typeof OPTIONAL).toBe("symbol");
    expect(configPath).toBeDefined();
    expect(configPath.combine("Server", "Port")).toBe("Server:Port");
    expect(configPath.getSectionKey("Server:Port")).toBe("Port");
  });

  test("ConfigurationBuilder ships add() (returning this) plus build()", () => {
    const builder = new ConfigurationBuilder();
    const returned = builder.add(new MemoryConfigurationSource({ initialData: { "A": "1" } }));

    // add() must return `this` for the augmentation pattern to type-check.
    expect(returned).toBe(builder);
    expect([...builder.sources].length).toBe(1);

    const root = builder.build();
    expect(root).toBeInstanceOf(ConfigurationRoot);
    expect(root.get("A")).toBe("1");
  });

  test("sources are ordered-list semantics: registration order preserved, no reference dedup", () => {
    const builder = new ConfigurationBuilder();
    const a = new MemoryConfigurationSource({ initialData: { "A": "1" } });
    const b = new MemoryConfigurationSource({ initialData: { "B": "2" } });

    builder.add(a).add(b).add(a);

    // The same source instance registered twice is NOT silently deduplicated
    // (a Set would collapse this to length 2) -- sources are an ordered list.
    expect([...builder.sources]).toEqual([a, b, a]);
  });

  test("addInMemoryCollection augmentation is installed on the prototype", () => {
    const root = new ConfigurationBuilder()
      .addInMemoryCollection({ "Server:Port": "8080" })
      .build();

    expect(root.get("Server:Port")).toBe("8080");
  });

  test("the abstract ConfigurationProvider base is subclassable by provider packages", () => {
    class FixedProvider extends ConfigurationProvider {
      public override load(): void {
        this.set("Fixed:Key", "value");
      }
    }
    class FixedSource implements IConfigurationSource {
      public build(_builder: IConfigurationBuilder): IConfigurationProvider {
        return new FixedProvider();
      }
    }

    const root = new ConfigurationBuilder().add(new FixedSource()).build();
    // Loaded eagerly at construction, resolved case-insensitively.
    expect(root.get("fixed:key")).toBe("value");
  });

  test("end-to-end: build a typed, coerced config through the public entry point alone", () => {
    const typed = new ConfigurationBuilder()
      .addInMemoryCollection({ "Host": "localhost", "Port": "8080" })
      .withSchema({ Host: "string", Port: "number" })
      .build();

    expect(typed).toEqual({ Host: "localhost", Port: 8080 });
    // The generic threads through so `Port` is statically a number.
    const port: number = typed.Port;
    expect(port).toBe(8080);
  });

  test("type-only exports are usable in a type position", () => {
    // Compile-time-only assertions -- if any of these types stopped being
    // exported, this file would fail to type-check under `tsc --noEmit`.
    type _Config = IConfiguration;
    type _Root = IConfigurationRoot;
    type _Section = IConfigurationSection;
    type _Provider = IConfigurationProvider;
    type _Builder = IConfigurationBuilder;
    type _Source = IConfigurationSource;
    type _Try = ITryGetResult<string>;
    type _Deep = ConfigObject;
    type _Indexed = IndexedSection;
    type _Obj = ObjectSchema;
    type _Opt = OptionalSchema;
    // A concrete, non-recursive schema shape -- `Infer<Schema>` (the fully
    // recursive union `Schema` itself) sends `tsc` into TS2589; this exercises
    // `Infer` in a type position without that runaway recursion.
    type _Inferred = Infer<{ a: "string"; b: { c: "number" } }>;
    const _schema: Schema = "string";
    expect(_schema).toBe("string");
  });
});
