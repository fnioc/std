package main

// OPTIONAL import injection.
//
// Codegen wraps an optional field as `{ [OPTIONAL]: innerSchema }`, where OPTIONAL
// is the `unique symbol` re-exported from the config barrel. Whenever a wrapper is
// emitted, the file needs a binding for that symbol. The binding is resolved once
// per file up front:
//
//  1. an existing NAMED import of `OPTIONAL` from the barrel (alias honored — use
//     the local name), or
//  2. an existing NAMESPACE import from the barrel (`<ns>.OPTIONAL`), or
//  3. none — fall back to a bare `OPTIONAL` identifier and flag that an
//     `import { OPTIONAL } from "<barrel>";` must be prepended IF a wrapper
//     actually lowers.
//
// "From the barrel" means the barrel specifier EXACTLY; a subpath does not export
// OPTIONAL.

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
)

const (
	configBarrel = "@rhombus-std/config"
	optionalName = "OPTIONAL"
)

// optionalRef describes how to reference the OPTIONAL symbol in a given source
// file, and whether a named import must be injected. Codegen sets used = true when
// it emits at least one wrapper; ensureOptionalImport then prepends the import only
// when used && injectNamed.
type optionalRef struct {
	// used is set by codegen when at least one optional wrapper was emitted.
	used bool
	// injectNamed is true when no existing binding was found and a named import
	// must be prepended.
	injectNamed bool
	// localName is the local identifier the OPTIONAL symbol is referenced by (an
	// existing named import's local name, honoring an alias, or the bare
	// "OPTIONAL"); used when namespace is empty.
	localName string
	// namespace, when non-empty, selects the `<namespace>.OPTIONAL` reference form.
	namespace string
}

// expr builds a FRESH expression evaluating to the OPTIONAL symbol at a use site.
// A fresh node per use avoids aliasing one node across multiple parents.
func (r *optionalRef) expr(f *shimast.NodeFactory) *shimast.Node {
	if r.namespace != "" {
		return f.NewPropertyAccessExpression(
			f.NewIdentifier(r.namespace),
			nil,
			f.NewIdentifier(optionalName),
			0,
		)
	}
	return f.NewIdentifier(r.localName)
}

// resolveOptionalBinding resolves the OPTIONAL binding for sourceFile (one lookup
// per file).
func resolveOptionalBinding(f *shimast.NodeFactory, sourceFile *shimast.SourceFile) *optionalRef {
	for _, statement := range sourceFile.Statements.Nodes {
		if statement.Kind != shimast.KindImportDeclaration {
			continue
		}
		decl := statement.AsImportDeclaration()
		if decl.ModuleSpecifier == nil || decl.ModuleSpecifier.Kind != shimast.KindStringLiteral {
			continue
		}
		if decl.ModuleSpecifier.Text() != configBarrel {
			continue
		}
		if decl.ImportClause == nil {
			continue
		}
		bindings := decl.ImportClause.AsImportClause().NamedBindings
		if bindings == nil {
			continue
		}
		// Namespace import: `import * as cfg from "<barrel>"`.
		if bindings.Kind == shimast.KindNamespaceImport {
			return &optionalRef{namespace: bindings.AsNamespaceImport().Name().Text()}
		}
		// Named imports: look for `OPTIONAL` (honoring an alias).
		if bindings.Kind == shimast.KindNamedImports {
			for _, element := range bindings.AsNamedImports().Elements.Nodes {
				specifier := element.AsImportSpecifier()
				imported := element.Name().Text()
				if specifier.PropertyName != nil {
					imported = specifier.PropertyName.Text()
				}
				if imported == optionalName {
					return &optionalRef{localName: element.Name().Text()}
				}
			}
		}
	}
	// No existing binding: use a bare `OPTIONAL` identifier and flag injection.
	return &optionalRef{localName: optionalName, injectNamed: true}
}

// ensureOptionalImport prepends `import { OPTIONAL } from "<barrel>";` to
// sourceFile iff at least one wrapper used it (ref.used) AND no existing binding
// was found (ref.injectNamed). Injected at most once per file.
func ensureOptionalImport(f *shimast.NodeFactory, sourceFile *shimast.SourceFile, ref *optionalRef) *shimast.SourceFile {
	if !ref.used || !ref.injectNamed {
		return sourceFile
	}
	importSpecifier := f.NewImportSpecifier(false, nil, f.NewIdentifier(optionalName))
	named := f.NewNamedImports(f.NewNodeList([]*shimast.Node{importSpecifier}))
	clause := f.NewImportClause(0, nil, named)
	moduleSpecifier := f.NewStringLiteral(configBarrel, shimast.TokenFlagsNone)
	importDecl := f.NewImportDeclaration(nil, clause, moduleSpecifier, nil)

	statements := make([]*shimast.Node, 0, len(sourceFile.Statements.Nodes)+1)
	statements = append(statements, importDecl)
	statements = append(statements, sourceFile.Statements.Nodes...)
	return f.UpdateSourceFile(sourceFile, f.NewNodeList(statements), sourceFile.EndOfFileToken).AsSourceFile()
}
