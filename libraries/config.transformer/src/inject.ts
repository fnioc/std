// OPTIONAL import injection.
//
// Codegen wraps an optional field as `{ [OPTIONAL]: innerSchema }`, where
// OPTIONAL is the `unique symbol` re-exported from the @rhombus-std/config BARREL
// (`export { OPTIONAL } from "@rhombus-std/config"`). Whenever a wrapper is
// emitted, the file needs a binding for that symbol. We resolve the binding
// once per file up front:
//
//   1. an existing NAMED import of `OPTIONAL` from "@rhombus-std/config" (alias
//      honored -- use the local name), or
//   2. an existing NAMESPACE import from "@rhombus-std/config" (`<ns>.OPTIONAL`), or
//   3. none -- fall back to a bare `OPTIONAL` identifier and flag that an
//      `import { OPTIONAL } from "@rhombus-std/config";` must be prepended IF a
//      wrapper actually lowers.
//
// "From @rhombus-std/config" means the barrel specifier EXACTLY; the subpath
// ".../with-type-augment" does not export OPTIONAL.

import ts from "typescript";

const CONFIG_BARREL = "@rhombus-std/config";
const OPTIONAL_NAME = "OPTIONAL";

/**
 * How to reference the OPTIONAL symbol in a given source file, and whether a
 * named import must be injected. Codegen sets `used = true` when it emits at
 * least one wrapper; `ensureOptionalImport` then prepends the import only when
 * `used && injectNamed`.
 */
export interface OptionalRef {
  /** Set by codegen when at least one optional wrapper was emitted. */
  used: boolean;
  /** Expression that evaluates to the OPTIONAL symbol at the use site. */
  readonly expr: ts.Expression;
  /** Whether a `import { OPTIONAL } from "@rhombus-std/config"` must be prepended. */
  readonly injectNamed: boolean;
}

/** Resolve the OPTIONAL binding for `sourceFile` (one lookup per file). */
export function resolveOptionalBinding(
  sourceFile: ts.SourceFile,
  factory: ts.NodeFactory,
): OptionalRef {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text !== CONFIG_BARREL) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) {
      continue;
    }
    // Namespace import: `import * as cfg from "@rhombus-std/config"`.
    if (ts.isNamespaceImport(bindings)) {
      return {
        used: false,
        expr: factory.createPropertyAccessExpression(
          factory.createIdentifier(bindings.name.text),
          OPTIONAL_NAME,
        ),
        injectNamed: false,
      };
    }
    // Named imports: look for `OPTIONAL` (honoring an alias).
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        // `element.propertyName` is the original name when aliased
        // (`OPTIONAL as OPT`); otherwise `element.name` is the imported name.
        const importedName = (element.propertyName ?? element.name).text;
        if (importedName === OPTIONAL_NAME) {
          return {
            used: false,
            expr: factory.createIdentifier(element.name.text),
            injectNamed: false,
          };
        }
      }
    }
  }

  // No existing binding: use a bare `OPTIONAL` identifier and flag injection.
  return {
    used: false,
    expr: factory.createIdentifier(OPTIONAL_NAME),
    injectNamed: true,
  };
}

/**
 * Prepend `import { OPTIONAL } from "@rhombus-std/config";` to `sourceFile` iff at
 * least one wrapper used it (`ref.used`) AND no existing binding was found
 * (`ref.injectNamed`). Injected at most once per file.
 */
export function ensureOptionalImport(
  sourceFile: ts.SourceFile,
  ref: OptionalRef,
  factory: ts.NodeFactory,
): ts.SourceFile {
  if (!ref.used || !ref.injectNamed) {
    return sourceFile;
  }
  const importDecl = factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(
          false,
          undefined,
          factory.createIdentifier(OPTIONAL_NAME),
        ),
      ]),
    ),
    factory.createStringLiteral(CONFIG_BARREL),
  );
  return factory.updateSourceFile(sourceFile, [
    importDecl,
    ...sourceFile.statements,
  ]);
}
