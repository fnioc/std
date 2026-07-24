// Package schemaoftransform is the generic `schemaof<T>()` primitive stage: it
// lowers each `schemaof<T>()` call to the runtime config-schema object literal for
// T over the ttsc-shipped typescript-go checker, materializing the `OPTIONAL`
// value-import any wrapped field needs, then elides the now-unreferenced import.
// It is a TYPE-argument primitive, sibling to nameof/keyof/valueof/singular.
//
// It is the engine half of the config family's `.withType<T>()` sugar: the inline
// body `withType<T>(this) { return this.withSchema(schemaof<T>()); }` substitutes
// at a consumer call site, and this stage lowers the synthetic `schemaof<T>()` the
// substitution mints. The schema walk it runs (internal/schema) is the SAME code
// the config `.withType` stage (the parity oracle, until its phase-3 deletion)
// drives, so the two paths emit byte-identical literals by construction.
//
// FAILURE UX (§ owner: "a transform still reports its OWN inability to lower"): an
// unsupported field type or a non-object root leaves the `schemaof<T>()` call
// UN-LOWERED and reports the SAME targeted diagnostic the config stage does
// (992001 / 992002) — NOT the generic "primitive survived" sweep error (the sweep
// defers to this stage for schemaof; see inlinetransform.Sweep). Because the loop
// re-runs this stage each pass, a per-run set dedupes the diagnostic to one
// emission per failing call node (the node survives identity across passes).
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_schemaof`
// stage. A substituted call carries no checker symbol (its callee is a side-parsed
// clone), so it is anchored via the inline artifacts; a source-written call is
// anchored by resolving its callee to the primitive symbol, mirroring keyof's two
// branches (source-written is not an authored path today — the primitive is
// body-only — but the anchor is kept for symmetry and robustness).
package schemaoftransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/schema"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// schemaofName is the exported identifier the primitive is recognized as — matched
// on the resolved symbol so an aliased import still lowers, and the name the inline
// stage records in its artifacts for a substituted call. It is also the sweep's
// key for deferring the surviving-primitive diagnostic to this stage.
const schemaofName = "schemaof"

// New builds the per-file transform: it visits every call expression, replaces
// each lowerable `schemaof<T>()` with T's runtime schema literal (injecting the
// OPTIONAL import a wrapped field needs), leaves an unsupported one un-lowered with
// a targeted diagnostic, then elides the now-unreferenced `schemaof` import.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did not
// run). emitted dedupes the failure diagnostic across the fixed-point loop's
// repeated passes: a failing call node survives identity between passes, so a set
// keyed on it emits exactly once.
func New(prog *driver.Program, _ *tokens.Context, artifacts *inlinetransform.Artifacts, emit func(plugin.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	emitted := map[*shimast.Node]bool{}
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		optional := valueimport.Resolve(sf, schema.OptionalMarker)
		ctx := &schema.Context{
			Checker:  checker,
			Program:  prog,
			Factory:  factory,
			Optional: optional,
			AddDiagnostic: func(code, message string, anchor *shimast.Node) {
				emit(plugin.Diagnostic{
					File:    sf.FileName(),
					Start:   anchorPos(anchor),
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
			if node.Kind == shimast.KindCallExpression {
				if t, ok := schemaofType(checker, artifacts, node); ok {
					// A call whose failure was already reported keeps its identity and
					// is not re-attempted (the loop hands it back every pass until the
					// file settles) — no duplicate diagnostic, no wasted walk.
					if emitted[node] {
						return node
					}
					literal, done := schema.LiteralForType(ctx, t, node)
					if done {
						return literal
					}
					// Unsupported type / non-object root: the walk already reported the
					// targeted 992001/992002. Leave the call un-lowered (no silent
					// partial) and remember it so a later pass does not re-emit.
					emitted[node] = true
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
		result := elideSchemaofImports(factory, output.AsSourceFile())
		return valueimport.Ensure(factory, result, optional)
	}
}

// anchorPos returns a diagnostic anchor's position, guarding a synthetic anchor
// with no program position (a substituted node) so the envelope carries a stable
// non-negative start.
func anchorPos(anchor *shimast.Node) int {
	if anchor == nil {
		return 0
	}
	if pos := anchor.Pos(); pos >= 0 {
		return pos
	}
	return 0
}

// schemaofType returns the bound type argument of a schemaof call at node — from
// the inline artifacts for a substituted (synthetic-callee) call, else by
// resolving a source-written `schemaof<T>()` callee to the primitive symbol.
func schemaofType(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimchecker.Type, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == schemaofName && len(use.TypeArgs) == 1 {
			return use.TypeArgs[0], true
		}
	}
	return sourceWrittenType(checker, node)
}

// sourceWrittenType returns the single type argument of a source-written
// `schemaof<T>()` — a one-type-argument call whose callee resolves (following an
// import alias) to the schemaof symbol. It anchors on the checker, which panics on
// a SYNTHETIC callee (no program position — the inline stage's substituted clone),
// so a negative position or an unlinked Parent is a clean skip (those are handled
// via artifacts above), mirroring keyof's guard.
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
	if symbol.Name != schemaofName {
		return nil, false
	}
	return checker.GetTypeFromTypeNode(call.TypeArguments.Nodes[0]), true
}

// elideSchemaofImports drops the now-unreferenced `schemaof` binding from the
// file's top-level imports, mirroring nameof/keyof import elision. The primary
// (inline) path never imports schemaof into the consumer (the substitution splices
// only the body's return expression), so this is a defensive no-op there; it fires
// for a source-written schemaof import.
func elideSchemaofImports(factory *shimast.NodeFactory, sf *shimast.SourceFile) *shimast.SourceFile {
	statements := sf.Statements.Nodes
	kept := make([]*shimast.Node, 0, len(statements))
	changed := false
	for _, statement := range statements {
		next := elideSchemaofImport(factory, statement)
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

// elideSchemaofImport returns the import statement with any `schemaof` specifier
// removed — the whole declaration dropped (nil) when that was its only binding,
// kept with the remaining bindings otherwise.
func elideSchemaofImport(factory *shimast.NodeFactory, statement *shimast.Node) *shimast.Node {
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
		if specifier.IsTypeOnly || exportedName(element) != schemaofName {
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
// (`schemaof as s`) when aliased, else its local name.
func exportedName(element *shimast.Node) string {
	specifier := element.AsImportSpecifier()
	if specifier.PropertyName != nil {
		return specifier.PropertyName.Text()
	}
	return element.Name().Text()
}
