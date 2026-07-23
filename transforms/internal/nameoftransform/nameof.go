// Package nameoftransform is the Go port of the nameof transformer: it lowers
// each `nameof<T>()` call to its derived string token over the ttsc-shipped
// typescript-go checker and elides the now-unreferenced `nameof` import. It is
// the emit-path twin of the hand-written TypeScript transformer; both derive
// identical tokens from the shared token core. The single owner host
// (cmd/ttsc-std) composes it as the `rhombusstd_nameof` stage.
//
// Derivation runs through DeriveTokenF (the open-generic-aware variant), NOT the
// bare DeriveToken: the reference transformer's ONE deriveToken renders a
// `Hole<N>` type argument as the literal `$N`, so `nameof<IRepository<$<1>>>()`
// must lower to `…:IRepository<$1>` — byte-identical to the token the di
// registration stage derives for the matching direct `addClass<IRepository<$<1>>>(…)`.
// Without the hole branch the inline registration path (`addClass<T>()` sugar →
// `nameof<T>()`) could never produce the open-template service token. DeriveTokenF
// also rejects the typescript-go internal-symbol name family (the `0xFE`-prefixed
// anonymous `__type` equivalents), so an anonymous type argument derives no token
// exactly as the di stage already treats it. For a `Keyed<T, K>` service type
// nameof derives just the BASE token (via ServiceBaseTokenFor — the brand
// stripped, NO `#key` suffix): the inline registration path composes that base
// with keyof<T>()'s key at runtime to land on the same `base#key` token the di
// direct stage derives via keyedTokenFor. nameof itself never appends the key
// (keyof owns the key half), so the two halves compose rather than double-count.
package nameoftransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// nameofName is the exported identifier the transformer recognizes as tokenfor —
// matched on the resolved symbol so an aliased import (`import { tokenfor as k }`)
// still lowers.
const nameofName = "tokenfor"

// tokenofName is the exported identifier the transformer recognizes as tokenof —
// the RAW-type value-argument twin of tokenfor. `tokenfor(value)` derives from the
// value's PRODUCED type (construct/call-sig return); `tokenof(value)` derives from
// the value's OWN type with NO unwrap, the form the `addValue(v)` self-registration
// lowers to so an already-built value registers under its own type (matching the
// di engine's raw-type `addValue` derivation). Both lower in THIS stage; the only
// difference is the ProducedTypeOf unwrap tokenfor applies and tokenof skips.
const tokenofName = "tokenof"

// valueArgUnderivableCode is the diagnostic a value-argument token derivation
// raises when the argument's type yields no derivable token (an anonymous /
// unnameable type) — a lowering failure the stage reports rather than emitting a
// silent empty token (constraint 9: failure reporting, not validation).
const valueArgUnderivableCode = "VALUE_ARG_TOKEN_UNDERIVABLE"

// New builds the per-file transform: it visits every call expression, and
// replaces each single-type-argument call to `nameof` with a string literal
// holding the token derived from the type argument.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did
// not run — behavior is then bit-for-bit the original). A substituted `nameof`
// call carries no checker symbol (its callee is a side-parsed clone), so
// isNameofCall can never anchor it; instead the inline stage registered it in
// artifacts.PrimitiveCalls with the type it resolved at the original call site,
// and this stage derives the SAME token from that registered type.
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, emit func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				call := node.AsCallExpression()
				// TYPE-argument tokenfor<T>() — source-written.
				if isNameofCall(checker, call) {
					typeNode := call.TypeArguments.Nodes[0]
					t := checker.GetTypeFromTypeNode(typeNode)
					token, _ := tokens.ServiceBaseTokenFor(ctx, t)
					return ec.Factory.AsNodeFactory().NewStringLiteral(token, shimast.TokenFlagsNone)
				}
				// TYPE-argument tokenfor<T>() — synthetic (inline-substituted).
				if use, ok := registeredNameof(artifacts, node); ok {
					token, _ := tokens.ServiceBaseTokenFor(ctx, use.TypeArgs[0])
					return ec.Factory.AsNodeFactory().NewStringLiteral(token, shimast.TokenFlagsNone)
				}
				// VALUE-argument tokenfor(value), PRODUCED semantics — synthetic (the
				// inline self-registration body's `this.addClass(tokenfor(ctor), ...)`).
				if arg, ok := registeredValueArg(artifacts, node, nameofName); ok {
					produced := tokens.ProducedTypeOf(checker, checker.GetTypeAtLocation(arg))
					return lowerValueArg(ec, ctx, emit, node, arg, produced)
				}
				// VALUE-argument tokenfor(value), PRODUCED semantics — source-written.
				if arg, ok := valueArgCall(checker, call, nameofName); ok {
					produced := tokens.ProducedTypeOf(checker, checker.GetTypeAtLocation(arg))
					return lowerValueArg(ec, ctx, emit, node, arg, produced)
				}
				// VALUE-argument tokenof(value), RAW semantics — synthetic (the inline
				// self-registration body's `this.addValue(tokenof(value), value)`). No
				// ProducedTypeOf unwrap: the value's OWN type is the token source.
				if arg, ok := registeredValueArg(artifacts, node, tokenofName); ok {
					return lowerValueArg(ec, ctx, emit, node, arg, checker.GetTypeAtLocation(arg))
				}
				// VALUE-argument tokenof(value), RAW semantics — source-written.
				if arg, ok := valueArgCall(checker, call, tokenofName); ok {
					return lowerValueArg(ec, ctx, emit, node, arg, checker.GetTypeAtLocation(arg))
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

// registeredNameof reports whether node is a synthetic `nameof` call the inline
// stage registered with a resolved TYPE argument (`tokenfor<T>()`).
func registeredNameof(artifacts *inlinetransform.Artifacts, node *shimast.Node) (inlinetransform.PrimitiveUse, bool) {
	if artifacts == nil {
		return inlinetransform.PrimitiveUse{}, false
	}
	use, ok := artifacts.PrimitiveCalls[node]
	if !ok || use.Name != nameofName || len(use.TypeArgs) == 0 {
		return inlinetransform.PrimitiveUse{}, false
	}
	return use, true
}

// registeredValueArg reports whether node is a synthetic value-argument primitive
// call the inline stage registered under primName (`tokenfor`'s produced form or
// `tokenof`'s raw form) — the shape a self-registration sugar body mints
// (`addClass(ctor) => this.addClass(tokenfor(ctor), ...)`,
// `addValue(value) => this.addValue(tokenof(value), value)`). It carries the
// ORIGINAL, program-bound call-site argument (ValueArg) and NO type argument; the
// caller derives the token from that argument's type (produced for tokenfor, raw
// for tokenof). It is the value-arg twin of registeredNameof, mirroring how the
// signatureof stage reads a substituted value argument.
func registeredValueArg(artifacts *inlinetransform.Artifacts, node *shimast.Node, primName string) (*shimast.Node, bool) {
	if artifacts == nil {
		return nil, false
	}
	use, ok := artifacts.PrimitiveCalls[node]
	if !ok || use.Name != primName || use.ValueArg == nil || len(use.TypeArgs) != 0 {
		return nil, false
	}
	return use.ValueArg, true
}

// lowerValueArg derives the service token for a value-argument primitive from t
// and returns the string-literal replacement for call. When t yields no derivable
// token — an anonymous / unnameable value type — it reports a targeted diagnostic
// (naming the failure) against the value ARGUMENT's position and returns the
// ORIGINAL call un-lowered, so a lowering failure surfaces as a diagnostic rather
// than a silent empty token (constraint 9). arg is the program-bound value
// argument (real position even when call itself is synthetic), so the diagnostic
// always points at real source.
func lowerValueArg(ec *shimprinter.EmitContext, ctx *tokens.Context, emit func(plugin.Diagnostic), call, arg *shimast.Node, t *shimchecker.Type) *shimast.Node {
	token, ok := tokens.ServiceBaseTokenFor(ctx, t)
	if !ok {
		emit(plugin.Diagnostic{
			Code:    valueArgUnderivableCode,
			File:    valueArgFile(arg),
			Start:   arg.Pos(),
			Message: "cannot derive a token for this value's type — name the type (annotate the value with a named type, or pass an explicit token string)",
		})
		return call
	}
	return ec.Factory.AsNodeFactory().NewStringLiteral(token, shimast.TokenFlagsNone)
}

// valueArgFile is the absolute file path of a value argument's source file, or ""
// (a synthetic node with no source file). The inline stage captures the ORIGINAL
// program-bound argument, so this resolves for the synthetic path too.
func valueArgFile(arg *shimast.Node) string {
	sf := shimast.GetSourceFileOfNode(arg)
	if sf == nil {
		return ""
	}
	return sf.FileName()
}

// elideNameofImports drops the now-unreferenced `nameof` binding from the file's
// top-level imports. After the rewrite above there is no runtime reference left,
// but the toolchain's import elision consults the ORIGINAL reference marks (where
// `nameof` WAS value-referenced), so without this pass the emit keeps a dangling
// `import { nameof } from "@rhombus-std/primitives"` — a value import with no
// remaining runtime reference (the token has been inlined).
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

// elideNameofImport returns the import statement with any lowered-primitive
// specifier (`tokenfor` / `tokenof`) removed — the whole declaration dropped (nil)
// when that was its only binding, the declaration kept with the remaining bindings
// otherwise. Non-import statements and imports without such a binding pass through
// unchanged. Both primitives lower to inline token literals leaving no runtime
// reference, so both must elide.
//
// Matching mirrors isNameofCall's / valueArgCall's looseness: any named-import
// specifier whose EXPORTED name is a lowered primitive elides (so
// `import { tokenfor as k }` elides too).
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
		if specifier.IsTypeOnly || !isLoweredPrimitiveName(exportedName(element)) {
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

// isLoweredPrimitiveName reports whether name is a value-token primitive THIS
// stage lowers to an inline literal (`tokenfor` / `tokenof`), leaving its import
// unreferenced and elidable.
func isLoweredPrimitiveName(name string) bool {
	return name == nameofName || name == tokenofName
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
//
// It anchors on the checker, which panics on a SYNTHETIC callee (a node with no
// program position — e.g. one the inline stage substituted). Such nodes are
// never a source-written nameof; a substituted nameof is handled via the inline
// artifacts instead. Guard on the callee's position so a synthetic node is a
// clean skip, not a nil-deref inside GetSymbolAtLocation.
//
// A second, subtler hazard shares the same failure mode: a call whose callee is
// a SOURCE-POSITIONED property access (e.g. the `.as` in `addClass(...).as<"x">()`)
// but whose OBJECT expression was just replaced by the inline stage's
// substitution (`addClass<T>(ctor)` → `addClass(nameof<T>(), ctor, signatureof(ctor))`).
// The factory's `Update...` call rebuilds the property-access node because its
// child changed, so the node itself keeps a real position, but the rebuild never
// re-links its `Parent` pointer (that linking only happens for a fresh parse or
// an explicit re-parent pass) — and the checker's `GetSymbolAtLocation` derefs
// `node.Parent.Parent` unconditionally, nil-panicking on the unlinked pointer.
// Guard on Parent for the same reason as Pos: an unlinked node was never
// checked, so it can never BE the checker's nameof, and a clean skip defers to
// whatever already lowered it (here, the di stage's own `.as` lowering).
func isNameofCall(checker *shimchecker.Checker, call *shimast.CallExpression) bool {
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return false
	}
	if call.Expression.Pos() < 0 || call.Expression.Parent == nil {
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

// valueArgCall reports whether call is a source-written VALUE-argument call to
// primName (`tokenfor`'s produced form or `tokenof`'s raw form) — a
// NO-type-argument, single-value-argument call whose callee resolves (following an
// import alias) to the primName symbol — and returns its value argument. It is the
// value-arg twin of isNameofCall: type-arg and value-arg calls are disjoint by the
// type-argument count (a type-arg call has exactly one type argument, a value-arg
// call none), so a call never matches both; and the two value-arg primitives are
// disjoint by callee symbol, so a call matches at most one primName.
//
// It anchors on the checker, so it carries the same synthetic-node guard
// isNameofCall documents: a callee with no program position (a substituted clone)
// or an unlinked Parent is never a source-written call — the synthetic value-arg
// form is handled via registeredValueArg — so a negative position or nil Parent
// is a clean skip, not a nil-deref inside GetSymbolAtLocation.
func valueArgCall(checker *shimchecker.Checker, call *shimast.CallExpression, primName string) (*shimast.Node, bool) {
	if call.TypeArguments != nil && len(call.TypeArguments.Nodes) != 0 {
		return nil, false
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
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
	return call.Arguments.Nodes[0], true
}
