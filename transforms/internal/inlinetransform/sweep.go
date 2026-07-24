package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// singularValuePrimitive is the primitive name whose survival past the fold gets a
// targeted diagnostic (§94) rather than the generic unlowered-primitive one.
const singularValuePrimitive = "singularValue"

// schemaofPrimitive is the config-schema primitive whose OWN stage reports its
// lowering failures (the targeted 992001/992002) and leaves the call un-lowered.
// A surviving `schemaof<T>()` is therefore already accompanied by that precise
// diagnostic, so the sweep defers to it rather than adding the generic
// "primitive survived" error — the owner ruling that a schemaof failure surfaces
// the targeted schema diagnostic, not the generic sweep one.
const schemaofPrimitive = "schemaof"

// Sweep is emit tripwire 2: a syntactic walk of a fully-lowered output file that
// hard-errors on any surviving primitive or listed-sugar call. It runs after all
// selected stages, only when the inline stage was active. It turns the inert
// paths (a drifted augment-vs-impl signature degrades to "sugar calls pass
// through") into a loud compile-time failure instead of a runtime throw.
//
// Known accepted residual (documented): a first-party stranger generic member
// named exactly like a listed sugar member with the same call shape would
// false-positive here — implausible in this workspace, loud, and diagnosable.
func Sweep(sf *shimast.SourceFile, artifacts *Artifacts) []plugin.Diagnostic {
	if artifacts == nil || !artifacts.Active {
		return nil
	}
	var diags []plugin.Diagnostic
	imports := importedNames(sf)

	walk(sf.AsNode(), func(n *shimast.Node) bool {
		if n.Kind != shimast.KindCallExpression {
			return false
		}
		call := n.AsCallExpression()

		// (1) surviving primitive: a nameof call with type args, or a node still
		// carrying a registered PrimitiveUse.
		if use, registered := artifacts.PrimitiveCalls[n]; registered {
			// A surviving `singularValue<T>()` is a TARGETED failure, not the generic
			// one: the singular stage leaves it un-lowered when T is not singular, and
			// the fold prunes it away in every GUARDED position
			// (`isSingular<T>() ? singularValue<T>() : …`), so one that reaches here is
			// unguarded over a non-singular type — name that specifically (§94) rather
			// than the opaque "primitive survived" message. This is failure reporting
			// keyed on the primitive NAME (data), not context-sensitive matching.
			if use.Name == singularValuePrimitive {
				diags = append(diags, sweepDiag("SINGULAR_VALUE_NON_SINGULAR", n,
					"singularValue<T>() resolved a non-singular type — it is only valid in the true arm of an isSingular<T>() guard, over a type with exactly one value (a literal, null, undefined, or void)"))
				return false
			}
			// A surviving `schemaof<T>()` is an un-lowerable schema (unsupported field
			// type / non-object root); its own stage already reported the targeted
			// 992001/992002 and left the call in place. Defer to that — don't add the
			// generic "primitive survived" error on top.
			if use.Name == schemaofPrimitive {
				return false
			}
			diags = append(diags, sweepDiag("INLINE_UNLOWERED_PRIMITIVE", n,
				"a registered primitive call survived lowering"))
			return false
		}
		if call.Expression.Kind == shimast.KindIdentifier && call.TypeArguments != nil &&
			len(call.TypeArguments.Nodes) >= 1 {
			if _, isPrimitive := knownPrimitives[call.Expression.Text()]; isPrimitive {
				diags = append(diags, sweepDiag("INLINE_UNLOWERED_PRIMITIVE", n,
					fmt.Sprintf("primitive %q with a type argument survived lowering", call.Expression.Text())))
				return false
			}
		}

		typeArgs, valueArgs := callArity(call)

		// (2) surviving member sugar: a property-access call whose name is a
		// certified member and whose (type-arg, value-arg) shape equals the sugar.
		if call.Expression.Kind == shimast.KindPropertyAccessExpression {
			name := call.Expression.AsPropertyAccessExpression().Name().Text()
			if shape, ok := artifacts.SugarMembers[name]; ok &&
				typeArgs == shape.TypeArgCount && valueArgs == shape.ValueArgCount {
				diags = append(diags, sweepDiag("INLINE_UNLOWERED_SUGAR", n,
					fmt.Sprintf("member sugar %q survived lowering", name)))
			}
			return false
		}

		// (3) surviving free-function sugar: an identifier call to a certified
		// function while its import binding still exists in the file.
		if call.Expression.Kind == shimast.KindIdentifier {
			name := call.Expression.Text()
			if _, ok := artifacts.SugarFunctions[name]; ok && imports[name] {
				diags = append(diags, sweepDiag("INLINE_UNLOWERED_SUGAR", n,
					fmt.Sprintf("free-function sugar %q survived lowering", name)))
			}
		}
		return false
	})
	return diags
}

// callArity returns a call's type-argument and value-argument counts.
func callArity(call *shimast.CallExpression) (int, int) {
	typeArgs := 0
	if call.TypeArguments != nil {
		typeArgs = len(call.TypeArguments.Nodes)
	}
	valueArgs := 0
	if call.Arguments != nil {
		valueArgs = len(call.Arguments.Nodes)
	}
	return typeArgs, valueArgs
}

// importedNames collects the local names a file's top-level imports still bind.
func importedNames(sf *shimast.SourceFile) map[string]bool {
	out := map[string]bool{}
	for _, stmt := range sf.Statements.Nodes {
		if stmt.Kind != shimast.KindImportDeclaration {
			continue
		}
		clause := stmt.AsImportDeclaration().ImportClause
		if clause == nil {
			continue
		}
		bindings := clause.AsImportClause().NamedBindings
		if bindings == nil || bindings.Kind != shimast.KindNamedImports {
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			out[el.Name().Text()] = true
		}
	}
	return out
}

func sweepDiag(code string, node *shimast.Node, msg string) plugin.Diagnostic {
	return plugin.Diagnostic{
		Code:    code,
		File:    nodeFile(node),
		Start:   node.Pos(),
		Message: fmt.Sprintf("%s at %s", msg, nodePosition(node)),
	}
}
