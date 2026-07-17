// Package configtransform is the Go port of the config transformer: it lowers
// each `<builder>.withType<T>()` call into a generated `<builder>.withSchema({...})`
// runtime schema literal over the ttsc-shipped typescript-go checker. It is the
// emit-path twin of the hand-written TypeScript transformer. The single owner
// host (cmd/ttsc-std) composes it as the `rhombusstd_config` stage.
package configtransform

// The config transform factory.
//
// Per source file the visitor walks depth-first (children before parents, so a
// receiver chain / nested withType is handled first); when a visited node is a
// `<builder>.withType<T>()` call, it is rewritten to `<builder>.withSchema({...})`
// with the generated runtime schema literal and the `<T>` type argument dropped.
// If codegen fails (unsupported type / non-object root), the ORIGINAL call is left
// in place — the hard diagnostic surfaces (never a silent partial). After the
// walk, an `OPTIONAL` import is injected if any optional field lowered to a
// wrapper.

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// New builds the per-file transform. The shared token core is unused —
// config schema derivation is self-contained.
func New(prog *driver.Program, _ *tokens.Context, addDiagnostic func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		optionalRef := resolveOptionalBinding(factory, sf)

		ctx := &codegenContext{
			checker:     checker,
			program:     prog,
			factory:     factory,
			sourceFile:  sf,
			optionalRef: optionalRef,
			addDiagnostic: func(code, message string, anchor *shimast.Node) {
				addDiagnostic(plugin.Diagnostic{
					File:    sf.FileName(),
					Start:   anchor.Pos(),
					Code:    code,
					Message: message,
				})
			},
		}

		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			// Depth-first: rewrite children (receiver chain, nested withType) first.
			visited := visitor.VisitEachChild(node)
			if visited != nil && visited.Kind == shimast.KindCallExpression {
				call := visited.AsCallExpression()
				if isWithTypeCall(checker, call) {
					return rewriteWithType(ctx, call, visited)
				}
			}
			return visited
		}
		visitor = ec.NewNodeVisitor(visit)

		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return ensureOptionalImport(factory, output.AsSourceFile(), optionalRef)
	}
}

// rewriteWithType rewrites `<builder>.withType<T>()` -> `<builder>.withSchema({...})`.
// On codegen failure it returns the original call node unchanged (the diagnostic
// already fired).
func rewriteWithType(ctx *codegenContext, call *shimast.CallExpression, original *shimast.Node) *shimast.Node {
	f := ctx.factory
	callee := call.Expression.AsPropertyAccessExpression()
	typeArg := call.TypeArguments.Nodes[0]

	literal, ok := schemaLiteralForTypeNode(ctx, typeArg)
	if !ok {
		return original
	}

	newCallee := f.NewPropertyAccessExpression(callee.Expression, nil, f.NewIdentifier("withSchema"), 0)
	// Drop the `<T>` type argument.
	return f.UpdateCallExpression(call, newCallee, nil, nil, f.NewNodeList([]*shimast.Node{literal}), 0)
}
