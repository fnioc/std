# @rhombus-std/config.core

Types-only configuration abstractions: the `IConfiguration*` interfaces
(`IConfiguration`, `IConfigurationBuilder`, `IConfigurationRoot`,
`IConfigurationSection`, `IConfigurationSource`, `IConfigurationProvider`,
`IConfigurationManager`) plus the `ITryGetResult` tuple type.

This package ships **zero runtime** — no JavaScript, only a `.d.ts` bundle.
`@rhombus-std/config` and the provider packages (`@rhombus-std/config.json`, `@rhombus-std/config.env`,
`@rhombus-std/config.commandline`) depend on it for shared interface types via `import
type`, so those types erase at compile time and never appear in any built
bundle.

## Install

You generally don't install this package directly — `@rhombus-std/config`
re-exports every type it defines, and installing `@rhombus-std/config` pulls it
in as a dependency automatically. Install it explicitly only if you're
writing a package that implements one of these interfaces (for example a
custom `IConfigurationSource`) without depending on `@rhombus-std/config`
itself.

```sh
npm install @rhombus-std/config.core
```

## Usage

```ts
import type { IConfiguration,
  IConfigurationSource } from '@rhombus-std/config.core';

function readPort(config: IConfiguration): string | undefined {
  return config.get('Server:Port');
}
```
