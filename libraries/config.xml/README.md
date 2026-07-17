# @rhombus-std/config.xml

**Read configuration from XML files.**

`@rhombus-std/config.xml` adds an XML file source to
[`@rhombus-std/config`](../config/README.md). Point it at an `.xml` file and its
elements, attributes, and text flatten into the same case-insensitive
configuration tree every other source feeds, so XML values sit alongside JSON,
INI, environment, and command-line values under one lookup.

It builds on the shared file base, so optional files, base-path resolution,
load-error handling, and reload-on-change come for free — this package adds the
XML grammar, via a small self-contained tokenizer with no XML-parser
dependency.

## Install

```sh
bun add @rhombus-std/config.xml @rhombus-std/config
```

## Usage

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import '@rhombus-std/config.xml';

const config = new ConfigBuilder()
  .addXmlFile('appsettings.xml', { optional: true, reloadOnChange: true })
  .build();

config.get('Server:Host');
```

Read an XML payload you already hold in memory with `addXmlStream`:

```ts
new ConfigBuilder()
  .addXmlStream('<settings><App><Name>demo</Name></App></settings>')
  .build();
```

## How XML maps to keys

The root element's _name_ is dropped; everything beneath it forms the key path:

```xml
<settings>
  <Server>
    <Host>localhost</Host>
    <Port>8080</Port>
  </Server>
</settings>
```

yields `Server:Host` = `localhost` and `Server:Port` = `8080`.

- **Element text** maps to the element's path. An empty element (`<Key></Key>`)
  yields an empty string; a self-closing element (`<Key/>`) yields nothing.
- **Attributes** map to `element:AttrName` — `<Server Port="8080" />` yields
  `Server:Port`.
- **The `Name` attribute** (case-insensitive) is special: it contributes an
  extra path segment rather than a value, so `<Endpoint Name="primary">` keys
  its contents under `Endpoint:primary:…`.
- **Repeated sibling elements** (same name, no distinguishing `Name`) get a
  numeric index: two `<Item>` elements become `Item:0` and `Item:1`.
- **CDATA** sections are treated as verbatim text; the five predefined entities
  (`&lt; &gt; &amp; &quot; &apos;`) and numeric character references are
  expanded.
- The XML declaration, comments, and processing instructions are ignored.

**Not supported:** XML namespaces (a name containing `:`), DTDs, and any entity
beyond the five predefined ones are rejected. A duplicate resolved key is an
error.

## Key exports

| Export                    | What it is                                                                  |
| ------------------------- | --------------------------------------------------------------------------- |
| `XmlConfigSource`         | A file source reading an XML file; `addXmlFile` registers one for you.      |
| `XmlConfigProvider`       | The provider `XmlConfigSource` builds — reads the file and flattens it.     |
| `XmlStreamConfigSource`   | A source over an in-memory XML payload; `addXmlStream` registers one.       |
| `XmlStreamConfigProvider` | The provider `XmlStreamConfigSource` builds.                                |
| `XmlConfigExtensions`     | The `addXmlFile` / `addXmlStream` builder methods, as standalone functions. |

## How it fits

`@rhombus-std/config.xml` builds on
[`@rhombus-std/config.file`](../config.file/README.md) for the file source and
provider bases (and everything they bring — optional files, base paths, reload)
and on [`@rhombus-std/config`](../config/README.md) for the builder it augments
and the stream source base. It is a sibling of
[`@rhombus-std/config.json`](../config.json/README.md) and
`@rhombus-std/config.ini`.

## Notes

- **`addXmlFile` and `addXmlStream` install on both the builder and the
  manager.** Importing the package once makes them available on
  `ConfigBuilder` and `ConfigManager` alike.
- **The parser is intentionally minimal.** It handles the element/attribute/
  text grammar configuration needs, not the full XML specification —
  namespaces, DTDs, and custom entities are out of scope by design.
- **Encrypted configuration is not supported.** There is no counterpart to
  encrypted-section decryption; XML is read as plain text.
