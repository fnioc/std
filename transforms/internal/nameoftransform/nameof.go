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

// nameofName is the exported identifier the transformer recognizes as nameof —
// matched on the resolved symbol so an aliased import (`import { nameof as k }`)
// still lowers.
const nameofName = "nameof"

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
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, _ func(plugin.Diagnostic)) plugin.FileTransform {
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
					token, _ := tokens.ServiceBaseTokenFor(ctx, t)
					return ec.Factory.AsNodeFactory().NewStringLiteral(token, shimast.TokenFlagsNone)
				}
				if use, ok := registeredNameof(artifacts, node); ok {
					token, _ := tokens.ServiceBaseTokenFor(ctx, use.TypeArgs[0])
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

// registeredNameof reports whether node is a synthetic `nameof` call the inline
// stage registered with a resolved type argument.
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
