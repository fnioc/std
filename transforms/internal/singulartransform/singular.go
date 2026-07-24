// Package singulartransform is the Go port of the resolve-family SINGULAR
// predicate/value primitives (§94): it lowers each `isSingular<T>()` to the
// boolean literal `true` / `false` and each `singularValue<T>()` to the singular
// type's value literal, over the ttsc-shipped typescript-go checker, then elides
// the now-unreferenced imports. Both are TYPE-argument primitives, siblings to
// nameof/keyof/valueof.
//
// "Singular" is the token grammar's term (tokens.SingletonValue) for a type with
// exactly one value — a string / number / bigint / boolean literal, or the whole
// `void` / `undefined` / `null` singletons. The resolve sugar body branches on
// them: `isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>())`. After
// this stage lowers `isSingular<T>()` to a boolean literal, the generic
// constant-fold step prunes the dead ternary branch, so a `singularValue<T>()` in
// the dead (non-singular) arm is removed before it can matter.
//
// `singularValue<T>()` over a NON-singular T is left UN-LOWERED here (never a
// silent value, never a diagnostic at this stage): the dead-branch prune removes
// the guarded case, and only a SURVIVING unguarded `singularValue<T>()` is a
// failure — reported with a targeted diagnostic by the inline emit sweep, not by
// this stage (the fold cannot know which primitive it prunes, so the survival
// check owns the diagnostic).
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_singular`
// stage. A substituted call carries no checker symbol (its callee is a side-parsed
// clone), so it is anchored via the inline artifacts; a source-written call is
// anchored by resolving its callee to the primitive symbol, mirroring keyof's two
// branches (source-written is not an authored path today — the primitives are
// body-only — but the anchor is kept for symmetry and robustness).
package singulartransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// isSingularName / singularValueName are the exported identifiers the primitives
// are recognized as — matched on the resolved symbol so an aliased import still
// lowers, and the names the inline stage records in its artifacts for a
// substituted call.
const (
	isSingularName    = "isSingular"
	singularValueName = "singularValue"
)

// New builds the per-file transform: it visits every call expression, replaces
// each `isSingular<T>()` with a boolean literal and each `singularValue<T>()` over
// a singular T with T's value literal (leaving a non-singular `singularValue<T>()`
// un-lowered), then elides the now-unused imports.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did not
// run). A substituted call carries no checker symbol (its callee is a side-parsed
// clone), so it is anchored via the type argument the inline stage captured; a
// source-written call is anchored by resolving its callee to the primitive symbol.
func New(prog *driver.Program, _ *tokens.Context, artifacts *inlinetransform.Artifacts, _ func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if t, ok := singularType(checker, artifacts, node, isSingularName); ok {
					return lowerIsSingular(ec, t)
				}
				if t, ok := singularType(checker, artifacts, node, singularValueName); ok {
					if lowered, done := lowerSingularValue(ec, t); done {
						return lowered
					}
					// Non-singular T: leave the call un-lowered and identical, so the
					// dead-branch prune can remove it (guarded case) or the emit sweep
					// can flag a survivor (unguarded case). Returning node unchanged
					// preserves its identity and its artifacts registration.
					return node
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideImports(ec.Factory.AsNodeFactory(), output.AsSourceFile())
	}
}

// lowerIsSingular renders the boolean-literal replacement for an `isSingular<T>()`
// call: `true` when T is a singular type, `false` otherwise.
func lowerIsSingular(ec *shimprinter.EmitContext, t *shimchecker.Type) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	if _, ok := tokens.SingletonValue(t); ok {
		return factory.NewKeywordExpression(shimast.KindTrueKeyword)
	}
	return factory.NewKeywordExpression(shimast.KindFalseKeyword)
}

// lowerSingularValue renders the value-literal replacement for a
// `singularValue<T>()` call over a SINGULAR T (done=true), or reports done=false
// when T is not singular (the caller leaves the call un-lowered).
func lowerSingularValue(ec *shimprinter.EmitContext, t *shimchecker.Type) (*shimast.Node, bool) {
	value, ok := tokens.SingletonValue(t)
	if !ok {
		return nil, false
	}
	return literalExpression(ec.Factory.AsNodeFactory(), value), true
}

// literalExpression renders a singular value as its TS literal expression — the
// same rendering the di stage's Rule-2 short-circuit emits: `null`, a string
// literal, a boolean keyword, a numeric / bigint literal (negative as a unary
// minus over the magnitude), or `void 0` for the undefined singleton.
func literalExpression(factory *shimast.NodeFactory, v tokens.LiteralValue) *shimast.Node {
	switch v.Kind {
	case tokens.LiteralNull:
		return factory.NewKeywordExpression(shimast.KindNullKeyword)
	case tokens.LiteralString:
		return factory.NewStringLiteral(v.Str, shimast.TokenFlagsNone)
	case tokens.LiteralBoolean:
		if v.Bool {
			return factory.NewKeywordExpression(shimast.KindTrueKeyword)
		}
		return factory.NewKeywordExpression(shimast.KindFalseKeyword)
	case tokens.LiteralNumber:
		lit := factory.NewNumericLiteral(v.Text, shimast.TokenFlagsNone)
		if v.Negated {
			return factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	case tokens.LiteralBigInt:
		lit := factory.NewBigIntLiteral(v.Text+"n", shimast.TokenFlagsNone)
		if v.Negated {
			return factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	default: // LiteralUndefined
		return factory.NewVoidExpression(factory.NewNumericLiteral("0", shimast.TokenFlagsNone))
	}
}

// singularType returns the bound type argument of a call to the primitive named
// primName at node — from the inline artifacts for a substituted (synthetic-callee)
// call, else by resolving a source-written call's callee to the primitive symbol.
func singularType(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node, primName string) (*shimchecker.Type, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == primName && len(use.TypeArgs) == 1 {
			return use.TypeArgs[0], true
		}
	}
	return sourceWrittenType(checker, node, primName)
}

// sourceWrittenType returns the single type argument of a source-written
// `primName<T>()` — a one-type-argument call whose callee resolves (following an
// import alias) to the primName symbol. It anchors on the checker, which panics on
// a SYNTHETIC callee (no program position — the inline stage's substituted clone),
// so a negative position or an unlinked Parent is a clean skip (those are handled
// via artifacts above), mirroring keyof's guard.
func sourceWrittenType(checker *shimchecker.Checker, node *shimast.Node, primName string) (*shimchecker.Type, bool) {
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
	if symbol.Name != primName {
		return nil, false
	}
	return checker.GetTypeFromTypeNode(call.TypeArguments.Nodes[0]), true
}

// elideImports drops the now-unreferenced `isSingular` / `singularValue` bindings
// from the file's top-level imports, mirroring nameof/keyof import elision.
func elideImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideImport(factory, statement)
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

// elideImport returns the import statement with any `isSingular` / `singularValue`
// specifier removed — the whole declaration dropped (nil) when that was its only
// binding, kept with the remaining bindings otherwise.
func elideImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
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
		if specifier.IsTypeOnly || !isSingularImportName(exportedName(element)) {
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

// isSingularImportName reports whether name is one of the primitives this stage
// lowers to an inline literal, leaving its import unreferenced and elidable.
func isSingularImportName(name string) bool {
	return name == isSingularName || name == singularValueName
}

// exportedName is a named import specifier's exported name — its property name
// when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
