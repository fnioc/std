// The Tier 1 schema-walker: withSchema(...).build() coerces the config into a
// typed POJO, or throws an aggregating SchemaCoercionError.

import { ConfigurationBuilder, OPTIONAL, SchemaCoercionError } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

describe("withSchema(...).build()", () => {
  test("coerces leaves and threads the inferred type", () => {
    const config = new ConfigurationBuilder()
      .addInMemoryCollection({
        "Server:Host": "h",
        "Server:Port": "8080",
        "Server:Ssl": "on",
      })
      .withSchema({
        Server: { Host: "string", Port: "number", Ssl: { [OPTIONAL]: "boolean" } },
      })
      .build();

    expect(config).toEqual({ Server: { Host: "h", Port: 8080, Ssl: true } });
    // Static: Port is a number, Ssl is boolean | undefined.
    const port: number = config.Server.Port;
    expect(port).toBe(8080);
  });

  test("an absent optional leaf coerces to undefined without raising an issue", () => {
    const config = new ConfigurationBuilder()
      .addInMemoryCollection({ "Host": "h", "Port": "1" })
      .withSchema({ Host: "string", Port: "number", Ssl: { [OPTIONAL]: "boolean" } })
      .build();

    expect(config).toEqual({ Host: "h", Port: 1, Ssl: undefined });
  });

  test("a missing required leaf throws SchemaCoercionError naming the path", () => {
    expect(() =>
      new ConfigurationBuilder()
        .addInMemoryCollection({ "Port": "1" })
        .withSchema({ Host: "string", Port: "number" })
        .build()
    ).toThrow(SchemaCoercionError);

    try {
      new ConfigurationBuilder()
        .addInMemoryCollection({ "Port": "1" })
        .withSchema({ Host: "string", Port: "number" })
        .build();
    } catch (err) {
      expect((err as SchemaCoercionError).issues.some((i) => i.includes("Host"))).toBe(true);
    }
  });

  test("aggregates a missing top-level key AND a bad deep number into one throw", () => {
    try {
      new ConfigurationBuilder()
        .addInMemoryCollection({ "Server:Db:Pool": "not-a-number" })
        .withSchema({
          Host: "string",
          Server: { Db: { Pool: "number" } },
        })
        .build();
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaCoercionError);
      const issues = (err as SchemaCoercionError).issues;
      expect(issues.length).toBe(2);
      expect(issues.some((i) => i.includes("Host"))).toBe(true);
      expect(issues.some((i) => i.includes("Server:Db:Pool") && i.includes("not-a-number"))).toBe(true);
    }
  });

  test("coerces nested objects", () => {
    const config = new ConfigurationBuilder()
      .addInMemoryCollection({
        "Database:Primary:Host": "db",
        "Database:Primary:PoolSize": "10",
      })
      .withSchema({ Database: { Primary: { Host: "string", PoolSize: "number" } } })
      .build();

    expect(config.Database.Primary.PoolSize).toBe(10);
  });

  test("resolves schema keys case-insensitively against the store", () => {
    const config = new ConfigurationBuilder()
      .addInMemoryCollection({ "PORT": "8080" })
      .withSchema({ Port: "number" })
      .build();

    expect(config).toEqual({ Port: 8080 });
  });
});
