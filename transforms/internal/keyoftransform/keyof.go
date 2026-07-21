// Package keyoftransform is the Go port of the keyof primitive: it lowers each
// `keyof<T>()` call to its `Keyed<T, K>` KEY as a string literal (or `void 0`
// when T is unkeyed) over the ttsc-shipped typescript-go checker, then elides the
// now-unreferenced `keyof` import. It is a TYPE-argument primitive, sibling to
// nameof: where `nameof<T>()` lowers to a service TOKEN, `keyof<T>()` lowers to
// the registration KEY of a keyed service.
//
// The two halves of a keyed inline registration are split across the two type
// primitives: `add<T>()` lowers to `this.add(nameof<T>(), ctor, signatureof(ctor),
// void 0, keyof<T>())` where nameof gives the BASE token and keyof gives the KEY,
// composed at runtime as `base#key` — the same token the di direct stage derives
// via keyedTokenFor. di.core's registration verbs order their arguments
// `(token, value, signatures, scope, key)`, so the key is argument 5 and the
// `void 0` ahead of it fills the scope slot the type-driven sugar has no value
// for. An UNKEYED registration never reaches this stage with a `keyof` argument:
// the inline stage elides the `keyof<T>()` when T is unkeyed — along with the
// stranded `void 0` placeholder, restoring the plain 3-argument form — so the
// only unkeyed calls this stage lowers are source-written ones, which become
// `void 0` themselves.
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_keyof`
// stage. A substituted `keyof` call carries no checker symbol (its callee is a
// side-parsed clone), so it is anchored via the inline artifacts; a source-written
// `keyof<T>()` is anchored by resolving its callee to the `keyof` symbol, mirroring
// nameof's two branches.
package keyoftransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// keyofName is the exported identifier the primitive is recognized as — matched
// on the resolved symbol so an aliased import still lowers, and the name the
// inline stage records in its artifacts for a substituted call.
const keyofName = "keyof"

// New builds the per-file transform: it visits every call expression and replaces
// each `keyof<T>()` with T's keyed KEY as a string literal (or `void 0` when T is
// unkeyed), then elides the now-unused `keyof` import.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did not
// run). A substituted `keyof` call carries no checker symbol (its callee is a
// side-parsed clone), so it is anchored via the type argument the inline stage
// captured at the original call site; a source-written call is anchored by
// resolving its callee to the `keyof` symbol.
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, _ func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if t, ok := keyofType(checker, artifacts, node); ok {
					return lowerKey(ec, checker, t)
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideKeyofImports(ec.Factory.AsNodeFactory(), output.AsSourceFile())
	}
}

// lowerKey renders the replacement for a keyof call over T: the keyed KEY as a
// string literal, or `void 0` (undefined) when T carries no `Keyed<T, K>` brand.
func lowerKey(ec *shimprinter.EmitContext, checker *shimchecker.Checker, t *shimchecker.Type) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	if key, keyed := tokens.KeyLiteralFor(t, checker); keyed {
		return factory.NewStringLiteral(key, shimast.TokenFlagsNone)
	}
	return factory.NewVoidExpression(factory.NewNumericLiteral("0", shimast.TokenFlagsNone))
}

// keyofType returns the bound type argument of a keyof call at node — from the
// inline artifacts for a substituted (synthetic-callee) call, else by resolving a
// source-written `keyof<T>()` callee to the primitive symbol.
func keyofType(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimchecker.Type, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == keyofName && len(use.TypeArgs) == 1 {
			return use.TypeArgs[0], true
		}
	}
	return sourceWrittenType(checker, node)
}

// sourceWrittenType returns the single type argument of a source-written
// `keyof<T>()` — a one-type-argument call whose callee resolves (following an
// import alias) to the `keyof` symbol. It anchors on the checker, which panics on
// a SYNTHETIC callee (no program position — the inline stage's substituted clone);
// such nodes are handled via artifacts above, so a negative position is a clean
// skip, not a nil-deref inside GetSymbolAtLocation. A node can also carry a real
// position but an unset `Parent` (a property access the inline substitution
// rebuilt because its OBJECT child changed) — the same clean-skip guard, mirroring
// nameoftransform.isNameofCall's `.as`-chain hazard.
func sourceWrittenType(checker *shimchecker.Checker, node *shimast.Node) (*shimchecker.Type, bool) {
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
	if symbol.Name != keyofName {
		return nil, false
	}
	return checker.GetTypeFromTypeNode(call.TypeArguments.Nodes[0]), true
}

// elideKeyofImports drops the now-unreferenced `keyof` binding from the file's
// top-level imports, mirroring nameoftransform's import elision: after the rewrite
// there is no runtime reference left, but the toolchain's import elision consults
// the ORIGINAL reference marks, so without this pass a dangling
// `import { keyof } from "@rhombus-std/di.transformer"` survives.
func elideKeyofImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideKeyofImport(factory, statement)
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

// elideKeyofImport returns the import statement with any `keyof` specifier removed
// — the whole declaration dropped (nil) when that was its only binding, kept with
// the remaining bindings otherwise. Matching mirrors sourceWrittenType's looseness:
// any named-import specifier whose EXPORTED name is `keyof` elides.
func elideKeyofImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
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
		if specifier.IsTypeOnly || exportedName(element) != keyofName {
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
// (`keyof` in `keyof as k`) when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
