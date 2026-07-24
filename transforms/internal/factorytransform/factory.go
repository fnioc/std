// Package factorytransform is the Go port of the resolve-family FACTORY primitives
// (§94, factory form): it lowers the three authoring-only primitives a factory
// resolve sugar body composes over a function type `F`.
//
//   - `isFactory<T>()`      -> the boolean literal `true` when T is a function type
//     (carries a call signature), `false` otherwise. The
//     sibling of `isSingular<T>()`; the constant-fold step
//     prunes the dead ternary arm after it lowers.
//   - `returntokenfor<T>()` -> the token of the factory's RETURN type (what it
//     builds), via `tokens.TokenForReturnType`.
//   - `paramtokensfor<T>()` -> the `[token, ...]` array of the factory's parameter
//     tokens (`Inject`-brand aware). As the TRAILING argument
//     of the enclosing `resolveFactory(returnToken, …)` call
//     it is ELIDED when the factory has no parameters, so a
//     no-arg factory lowers to the bare `resolveFactory(token)`
//     — byte-identical to di.core's own factory lowering
//     (ditransform.lowerResolveCall).
//
// Together they lower the body arm
// `isFactory<T>() ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>()) : …`
// to exactly what di-direct's `resolveFactory` rename + param-token array emits.
//
// Anchoring mirrors the singular stage: a substituted (synthetic-callee) call is
// anchored via the inline artifacts, a source-written call by resolving its callee
// to the primitive symbol. The single owner host composes it as the
// `rhombusstd_factory` stage, after singular and before the fold.
package factorytransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

const (
	isFactoryName      = "isFactory"
	returnTokenforName = "returntokenfor"
	paramTokensforName = "paramtokensfor"
)

// factoryParamUnderivableCode is the diagnostic a factory parameter-token
// derivation raises when a parameter's type yields no token — a lowering failure
// the stage reports rather than emitting a silent empty token. It mirrors
// ditransform's factory-param codeUnderivableToken message.
const factoryParamUnderivableCode = "990030"

// New builds the per-file transform. It visits every call expression and lowers
// each factory primitive, then elides the now-unused imports.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did not
// run). A substituted call carries no checker symbol, so it is anchored via the
// type argument the inline stage captured; a source-written call is anchored by
// resolving its callee to the primitive symbol.
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, emit func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				// isFactory<T>() -> boolean literal.
				if t, ok := factoryType(checker, artifacts, node, isFactoryName); ok {
					if isFunctionType(checker, t) {
						return factory.NewKeywordExpression(shimast.KindTrueKeyword)
					}
					return factory.NewKeywordExpression(shimast.KindFalseKeyword)
				}
				// returntokenfor<T>() -> the factory return type's token literal.
				if t, ok := factoryType(checker, artifacts, node, returnTokenforName); ok {
					if token, has := returnToken(ctx, checker, t); has {
						return factory.NewStringLiteral(token, shimast.TokenFlagsNone)
					}
					// Underivable return type: leave un-lowered (loud — the sweep flags
					// a surviving registered primitive; never a silent empty token).
					return node
				}
				// A `resolveFactory(returnToken, paramtokensfor<T>())`-shaped call:
				// lower the trailing paramtokensfor to its array literal, or ELIDE it
				// when the factory takes no parameters. Handled at the parent-call
				// level so the empty case can drop the argument entirely.
				if lowered, changed := lowerTrailingParamtokens(ec, checker, artifacts, ctx, emit, visitor, node); changed {
					return lowered
				}
				// A bare paramtokensfor<T>() reached outside a trailing position
				// (defensive) lowers to its array literal in place.
				if t, ok := factoryType(checker, artifacts, node, paramTokensforName); ok {
					lits, _ := paramTokenLits(ec, ctx, checker, emit, node, t)
					return factory.NewArrayLiteralExpression(factory.NewNodeList(lits), false)
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideImports(factory, output.AsSourceFile())
	}
}

// lowerTrailingParamtokens rewrites a call whose LAST argument is a
// `paramtokensfor<T>()` call: the leading arguments and callee are visited
// normally (so a `returntokenfor<T>()` at argument 0 lowers), and the trailing
// paramtokensfor is replaced by its `[token, ...]` array — or DROPPED when the
// factory has no parameters, matching di.core's `resolveFactory(returnToken)`
// no-arg form. Returns changed=false when the last argument is not a
// paramtokensfor call, leaving the ordinary visitor to recurse.
func lowerTrailingParamtokens(ec *shimprinter.EmitContext, checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, ctx *tokens.Context, emit func(plugin.Diagnostic), visitor *shimast.NodeVisitor, node *shimast.Node) (*shimast.Node, bool) {
	call := node.AsCallExpression()
	if call.Arguments == nil {
		return nil, false
	}
	args := call.Arguments.Nodes
	if len(args) == 0 {
		return nil, false
	}
	last := args[len(args)-1]
	if last.Kind != shimast.KindCallExpression {
		return nil, false
	}
	t, ok := factoryType(checker, artifacts, last, paramTokensforName)
	if !ok {
		return nil, false
	}
	factory := ec.Factory.AsNodeFactory()
	lits, derived := paramTokenLits(ec, ctx, checker, emit, last, t)
	if !derived {
		// A parameter token was underivable: the diagnostic already fired. Leave the
		// paramtokensfor call un-lowered so the sweep reports a loud survivor rather
		// than emitting a malformed array.
		return nil, false
	}
	kept := make([]*shimast.Node, 0, len(args))
	for _, a := range args[:len(args)-1] {
		kept = append(kept, visitor.VisitNode(a))
	}
	// An empty parameter list elides the whole trailing array argument.
	if len(lits) != 0 {
		kept = append(kept, factory.NewArrayLiteralExpression(factory.NewNodeList(lits), false))
	}
	newCallee := visitor.VisitNode(call.Expression)
	return factory.NewCallExpression(newCallee, nil, nil, factory.NewNodeList(kept), 0), true
}

// isFunctionType reports whether t is a function type — it carries at least one
// call signature. This is the checker-Type reading of ditransform's
// `typeArg.Kind == KindFunctionType` node test: the inline path captures the
// bound type, not the type node, so the predicate reads call signatures.
func isFunctionType(checker *shimchecker.Checker, t *shimchecker.Type) bool {
	return len(shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall)) != 0
}

// returnToken derives the token of a factory type's return type (its product),
// via the same TokenForReturnType di-direct's factory lowering uses.
func returnToken(ctx *tokens.Context, checker *shimchecker.Checker, t *shimchecker.Type) (string, bool) {
	sigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall)
	if len(sigs) == 0 {
		return "", false
	}
	return tokens.TokenForReturnType(ctx, sigs[0])
}

// paramTokenLits derives the string-literal token nodes for a factory type's
// parameters — an `Inject`-branded parameter takes its branded token, every other
// its own derived token, exactly ditransform's factory param extraction. An
// underivable parameter type emits a targeted diagnostic (against anchor) and
// yields derived=false, so the caller leaves the call un-lowered.
func paramTokenLits(ec *shimprinter.EmitContext, ctx *tokens.Context, checker *shimchecker.Checker, emit func(plugin.Diagnostic), anchor *shimast.Node, t *shimchecker.Type) ([]*shimast.Node, bool) {
	sigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall)
	if len(sigs) == 0 {
		return nil, true
	}
	factory := ec.Factory.AsNodeFactory()
	params := shimchecker.Signature_parameters(sigs[0])
	lits := make([]*shimast.Node, 0, len(params))
	for _, ps := range params {
		paramType := checker.GetTypeOfSymbol(ps)
		if paramType == nil {
			return nil, false
		}
		if branded, ok := tokens.InjectTokenFor(paramType, checker); ok {
			lits = append(lits, factory.NewStringLiteral(branded, shimast.TokenFlagsNone))
			continue
		}
		if token, ok := tokens.TokenForType(ctx, paramType, nil); ok {
			lits = append(lits, factory.NewStringLiteral(token, shimast.TokenFlagsNone))
			continue
		}
		emit(plugin.Diagnostic{
			Code:    factoryParamUnderivableCode,
			File:    anchorFile(anchor),
			Start:   anchor.Pos(),
			Message: "cannot derive a token for this factory parameter type — name the type or brand the parameter with `Inject<T, 'my:token'>`",
		})
		return nil, false
	}
	return lits, true
}

// factoryType returns the bound type argument of a call to the primitive named
// primName at node — from the inline artifacts for a substituted call, else by
// resolving a source-written call's callee to the primitive symbol. Mirrors the
// singular stage's anchoring.
func factoryType(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node, primName string) (*shimchecker.Type, bool) {
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
// a SYNTHETIC callee (no program position), so a negative position or an unlinked
// Parent is a clean skip (those are handled via artifacts above).
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

// anchorFile returns the source file path a diagnostic anchor sits in, or "" for a
// synthetic node (which has no source file).
func anchorFile(node *shimast.Node) string {
	if node == nil {
		return ""
	}
	if sf := shimast.GetSourceFileOfNode(node); sf != nil {
		return sf.FileName()
	}
	return ""
}

// isFactoryImportName reports whether name is one of the factory primitives this
// stage lowers, leaving its import unreferenced and elidable.
func isFactoryImportName(name string) bool {
	return name == isFactoryName || name == returnTokenforName || name == paramTokensforName
}

// elideImports drops the now-unreferenced factory-primitive bindings from the
// file's top-level imports, mirroring the singular stage's import elision.
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

// elideImport returns the import statement with any factory-primitive specifier
// removed — the whole declaration dropped (nil) when that was its only binding.
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
		if specifier.IsTypeOnly || !isFactoryImportName(exportedName(element)) {
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
// when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
