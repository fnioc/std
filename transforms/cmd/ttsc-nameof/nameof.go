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
		return output.AsSourceFile()
	}
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
