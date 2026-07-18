package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/plugin"
)

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
		if _, registered := artifacts.PrimitiveCalls[n]; registered {
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
