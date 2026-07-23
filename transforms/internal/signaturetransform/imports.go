package signaturetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// loweredPrimitiveNames is the set of value-referenced primitives this stage
// inlines away — the value-argument `signatureof` and its type-argument minting
// siblings `signaturefor` / `signaturesfor` — whose now-dangling import bindings
// this pass elides.
var loweredPrimitiveNames = map[string]bool{
	signatureofName:   true,
	signatureforName:  true,
	signaturesforName: true,
}

// elideSignatureofImports drops the now-unreferenced `signatureof` /
// `signaturefor` / `signaturesfor` bindings from the file's top-level imports.
// After the rewrite there is no runtime reference left, but the toolchain's import
// elision consults the ORIGINAL reference marks (where the primitive WAS
// value-referenced), so without this pass the emit keeps a dangling
// `import { signatureof } from "@rhombus-std/di.transformer"` — a value import with
// no remaining runtime reference (the array has been inlined). The specifier is
// matched by exported name, not module, so it elides regardless of where the
// primitive was imported from (signatureof from di.transformer, signaturefor /
// signaturesfor from di.core). The inline path emits no such import (the sugar
// body's callee is synthetic and the consumer never imports the primitive), so
// this only fires for a source-written call; it mirrors the nameof stage's elision.
func elideSignatureofImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideSignatureofImport(factory, statement)
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

// elideSignatureofImport returns the import statement with any lowered-primitive
// specifier removed — the whole declaration dropped (nil) when that was its only
// binding, the declaration kept with the remaining bindings otherwise.
// Non-import statements and imports without such a binding pass through
// unchanged. Any named-import specifier whose EXPORTED name is a lowered primitive
// elides (so `import { signatureof as sig }` elides too).
func elideSignatureofImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
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
		if specifier.IsTypeOnly || !loweredPrimitiveNames[exportedName(element)] {
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
// (`signatureof` in `signatureof as sig`) when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
