// Package valueoftransform is the Go port of the valueof primitive: it lowers
// each `valueof<T>()` call to its literal type's VALUE expression
// (`valueof<"scoped">()` → `"scoped"`, `valueof<42>()` → `42`) over the
// ttsc-shipped typescript-go checker. It is the authoring-only literal-value half
// of the `.as<Scope>()` sugar (`this.as(valueof<Scope>())`, §92) — the extraction
// formerly bespoke inside the di stage's `.as` lowering, factored into its own
// primitive so `.as` becomes a plain inline body. The single owner host
// (cmd/ttsc-std) composes it as the `rhombusstd_valueof` stage, after keyof and
// before di.
//
// valueof is authoring-only — it appears only inside the substituted sugar body,
// never in shipped runtime source — so the primary path is an inline-substituted
// call whose bound literal type the inline stage recorded in artifacts (its
// synthetic callee carries no symbol). A source-written call is handled defensively
// by symbol anchoring, mirroring nameof.
package valueoftransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// valueofName is the exported identifier the primitive is recognized as — matched
// on the resolved symbol so an aliased import still lowers, and the name the inline
// stage records in its artifacts for a substituted call.
const valueofName = "valueof"

// New builds the per-file transform: it visits every call expression and replaces
// each `valueof<T>()` — a source-written one anchored by symbol, or an
// inline-substituted one read from the artifacts — with the literal value
// expression of `T`, then elides the now-unreferenced `valueof` import.
func New(prog *driver.Program, _ *tokens.Context, artifacts *inlinetransform.Artifacts, _ func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if t, ok := valueofType(checker, artifacts, node); ok {
					if lit, ok := literalExpression(factory, t); ok {
						return lit
					}
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideValueofImports(factory, output.AsSourceFile())
	}
}

// valueofType returns the bound type argument of a valueof call at node — from the
// inline artifacts for a substituted (synthetic-callee) call, else by resolving a
// source-written `valueof<T>()` callee to the primitive symbol and reading its type
// argument through the checker.
func valueofType(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimchecker.Type, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == valueofName && len(use.TypeArgs) != 0 {
			return use.TypeArgs[0], true
		}
	}
	return sourceWrittenValueof(checker, node)
}

// sourceWrittenValueof resolves a source-written `valueof<T>()` — a
// single-type-argument call whose callee resolves (following an import alias) to
// the `valueof` symbol — and returns the checker type of its type argument. It
// guards the callee's position / parent as nameof does: the checker's
// GetSymbolAtLocation panics on a synthetic callee (no program position) or an
// inline-rebuilt property access (an unset Parent), so both are a clean skip.
func sourceWrittenValueof(checker *shimchecker.Checker, node *shimast.Node) (*shimchecker.Type, bool) {
	call := node.AsCallExpression()
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return nil, false
	}
	callee := call.Expression
	if callee.Pos() < 0 || callee.Parent == nil {
		return nil, false
	}
	symbol := checker.GetSymbolAtLocation(callee)
	if symbol == nil {
		return nil, false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	if symbol.Name != valueofName {
		return nil, false
	}
	return checker.GetTypeFromTypeNode(call.TypeArguments.Nodes[0]), true
}

// literalExpression renders a Rule-2 singular type's VALUE as its TS literal
// expression: a string / boolean keyword, a numeric / bigint literal (negative
// rendered as a unary minus over the magnitude), `null`, or `void 0` for the
// undefined singleton. ok=false when the type is not a singular value (a union or
// the wide `boolean` scalar) — a caller then leaves the call for the emit sweep.
func literalExpression(factory *shimast.NodeFactory, t *shimchecker.Type) (*shimast.Node, bool) {
	v, ok := tokens.SingletonValue(t)
	if !ok {
		return nil, false
	}
	switch v.Kind {
	case tokens.LiteralNull:
		return factory.NewKeywordExpression(shimast.KindNullKeyword), true
	case tokens.LiteralString:
		return factory.NewStringLiteral(v.Str, shimast.TokenFlagsNone), true
	case tokens.LiteralBoolean:
		if v.Bool {
			return factory.NewKeywordExpression(shimast.KindTrueKeyword), true
		}
		return factory.NewKeywordExpression(shimast.KindFalseKeyword), true
	case tokens.LiteralNumber:
		lit := factory.NewNumericLiteral(v.Text, shimast.TokenFlagsNone)
		if v.Negated {
			return factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit), true
		}
		return lit, true
	case tokens.LiteralBigInt:
		lit := factory.NewBigIntLiteral(v.Text+"n", shimast.TokenFlagsNone)
		if v.Negated {
			return factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit), true
		}
		return lit, true
	default: // LiteralUndefined
		return factory.NewVoidExpression(factory.NewNumericLiteral("0", shimast.TokenFlagsNone)), true
	}
}
