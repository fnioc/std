package dioptionstransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// unlowerableCode is the stable diagnostic code the transformer raises when an
// `addOptions<T>()` sugar call cannot be lowered — either the options wrapper
// base is absent from the program or `T` has no derivable token. Kept as the
// exact numeric string the hand-written transformer emits.
const unlowerableCode = "990020"

const (
	// msgNoOptionsBase surfaces when the package-public `Options` type is not in
	// the program, so the `Options<T>` wrapper token cannot be derived.
	msgNoOptionsBase = "cannot lower addOptions<T>(): the @rhombus-std/options `Options` type is " +
		"not in the program, so the Options<T> wrapper token cannot be derived. " +
		"Ensure @rhombus-std/options is a dependency."
	// msgNoElement surfaces when `T` itself yields no token (an anonymous inline
	// object type has no stable identity).
	msgNoElement = "cannot lower addOptions<T>(): no token can be derived for T — name the " +
		"options type (an anonymous inline object type has no stable token)."
)

// addOptionsTransform builds the per-file transform: it visits every call
// expression and rewrites each tokenless `<manifest>.addOptions<T>()` sugar to
// the explicit two-token verb, dropping the `<T>` type argument. On a derivation
// failure it leaves the original call in place and emits a hard diagnostic.
//
// The options wrapper base is resolved ONCE per program (it scans the module
// export graph for the package-public `Options` interface); an absent base makes
// every sugar call unlowerable.
func AddOptionsTransform(prog *driver.Program, ctx *tokens.Context, addDiagnostic func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	optionsBase, hasBase := resolveOptionsBase(prog, ctx)

	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				call := node.AsCallExpression()
				if isAddOptionsSugarCall(checker, call) {
					return rewriteAddOptions(ec, ctx, checker, call, sf, optionsBase, hasBase, addDiagnostic)
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

// rewriteAddOptions replaces `<manifest>.addOptions<T>()` with
// `<manifest>.addOptions("<Options<T>>", "<T>")`: the wrapper is the closed-generic
// form over the SAME element token any `resolve<T>()` / `add<T>()` would derive,
// so the two string arguments are relationally locked. On any derivation failure
// it returns the original call and emits a diagnostic anchored at `T`.
func rewriteAddOptions(
	ec *shimprinter.EmitContext,
	ctx *tokens.Context,
	checker *shimchecker.Checker,
	call *shimast.CallExpression,
	sf *shimast.SourceFile,
	optionsBase string,
	hasBase bool,
	addDiagnostic func(plugin.Diagnostic),
) *shimast.Node {
	typeArg := call.TypeArguments.Nodes[0]

	if !hasBase {
		addDiagnostic(diagnosticAt(sf, typeArg, msgNoOptionsBase))
		return call.AsNode()
	}

	element, ok := tokens.DeriveToken(ctx, checker.GetTypeFromTypeNode(typeArg))
	if !ok {
		addDiagnostic(diagnosticAt(sf, typeArg, msgNoElement))
		return call.AsNode()
	}

	wrapper := optionsBase + "<" + element + ">"
	factory := ec.Factory.AsNodeFactory()
	args := factory.NewNodeList([]*shimast.Node{
		factory.NewStringLiteral(wrapper, shimast.TokenFlagsNone),
		factory.NewStringLiteral(element, shimast.TokenFlagsNone),
	})
	// Drop the `<T>` type argument (nil type-argument list); keep the callee and
	// any optional-chain token.
	return factory.UpdateCallExpression(call, call.Expression, call.QuestionDotToken, nil, args, call.Flags)
}

// diagnosticAt builds an unlowerable-addOptions diagnostic anchored at a node.
func diagnosticAt(sf *shimast.SourceFile, node *shimast.Node, message string) plugin.Diagnostic {
	return plugin.Diagnostic{
		File:    sf.FileName(),
		Start:   node.Pos(),
		Code:    unlowerableCode,
		Message: message,
	}
}
