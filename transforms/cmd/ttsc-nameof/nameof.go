package main

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// nameofName is the exported identifier the transformer recognizes as nameof —
// matched on the resolved symbol so an aliased import (`import { nameof as k }`)
// still lowers.
const nameofName = "nameof"

// nameofTransform builds the per-file transform: it visits every call
// expression, and replaces each single-type-argument call to `nameof` with a
// string literal holding the token derived from the type argument.
func nameofTransform(prog *driver.Program, ctx *tokens.Context, _ func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				call := node.AsCallExpression()
				if isNameofCall(checker, call) {
					typeNode := call.TypeArguments.Nodes[0]
					t := checker.GetTypeFromTypeNode(typeNode)
					token, _ := tokens.DeriveToken(ctx, t)
					return ec.Factory.AsNodeFactory().NewStringLiteral(token, shimast.TokenFlagsNone)
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideNameofImports(ec.Factory.AsNodeFactory(), output.AsSourceFile())
	}
}

// elideNameofImports drops the now-unreferenced `nameof` binding from the file's
// top-level imports. After the rewrite above there is no runtime reference left,
// but the toolchain's import elision consults the ORIGINAL reference marks (where
// `nameof` WAS value-referenced), so without this pass the emit keeps a dangling
// `import { nameof } from "@rhombus-std/primitives.transformer/..."` — a
// build-time module no runtime consumer can resolve.
func elideNameofImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideNameofImport(factory, statement)
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

// elideNameofImport returns the import statement with any `nameof` specifier
// removed — the whole declaration dropped (nil) when that was its only binding,
// the declaration kept with the remaining bindings otherwise. Non-import
// statements and imports without a `nameof` binding pass through unchanged.
//
// Matching mirrors isNameofCall's looseness: any named-import specifier whose
// EXPORTED name is `nameof` elides (so `import { nameof as keyOf }` elides too).
func elideNameofImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
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
		if specifier.IsTypeOnly || exportedName(element) != nameofName {
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
// (`nameof` in `nameof as keyOf`) when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}

// isNameofCall reports whether call is a single-type-argument call whose callee
// resolves to the `nameof` symbol (following an import alias).
func isNameofCall(checker *shimchecker.Checker, call *shimast.CallExpression) bool {
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return false
	}
	symbol := checker.GetSymbolAtLocation(call.Expression)
	if symbol == nil {
		return false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	return symbol.Name == nameofName
}
