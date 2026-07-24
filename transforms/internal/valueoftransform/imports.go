package valueoftransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// elideValueofImports drops the now-unreferenced `valueof` binding from the file's
// top-level imports. After the rewrite there is no runtime reference left, but the
// toolchain's import elision consults the ORIGINAL reference marks (where `valueof`
// WAS value-referenced), so without this pass the emit keeps a dangling
// `import { valueof } from "@rhombus-std/di.extras"` — a value import with no
// remaining runtime reference (the value has been inlined). The inline path emits
// no such import (the sugar body's callee is synthetic and the consumer never
// imports the primitive), so this only fires for a source-written valueof; it
// mirrors the nameof stage's elision.
func elideValueofImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideValueofImport(factory, statement)
		if next == nil {
			changed = true
			continue
		}
		if next != statement {
			changed = true
		}
		kept = append(kept, next)
	}
	if !changed {
		return sf
	}
	return factory.UpdateSourceFile(sf, factory.NewNodeList(kept), sf.EndOfFileToken).AsSourceFile()
}

// elideValueofImport returns the import statement with any `valueof` specifier
// removed — the whole declaration dropped (nil) when that was its only binding, the
// declaration kept with the remaining bindings otherwise. Non-import statements and
// imports without a `valueof` binding pass through unchanged. Any named-import
// specifier whose EXPORTED name is `valueof` elides (so `import { valueof as v }`
// elides too).
func elideValueofImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
	if statement.Kind != shimast.KindImportDeclaration {
		return statement
	}
	decl := statement.AsImportDeclaration()
	clauseNode := decl.ImportClause
	if clauseNode == nil {
		return statement
	}
	clause := clauseNode.AsImportClause()
	if clause.PhaseModifier == shimast.KindTypeKeyword {
		return statement
	}
	bindings := clause.NamedBindings
	if bindings == nil || bindings.Kind != shimast.KindNamedImports {
		return statement
	}
	elements := bindings.AsNamedImports().Elements.Nodes
	kept := make([]*shimast.Node, 0, len(elements))
	for _, element := range elements {
		specifier := element.AsImportSpecifier()
		if specifier.IsTypeOnly || exportedName(element) != valueofName {
			kept = append(kept, element)
		}
	}
	if len(kept) == len(elements) {
		return statement
	}
	if len(kept) == 0 && clause.Name() == nil {
		return nil
	}
	var namedBindings *shimast.Node
	if len(kept) != 0 {
		namedBindings = factory.UpdateNamedImports(bindings.AsNamedImports(), factory.NewNodeList(kept))
	}
	newClause := factory.UpdateImportClause(clause, clause.PhaseModifier, clause.Name(), namedBindings)
	return factory.UpdateImportDeclaration(decl, decl.Modifiers(), newClause, decl.ModuleSpecifier, decl.Attributes)
}

// exportedName is a named import specifier's exported name — its property name
// (`valueof` in `valueof as v`) when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
