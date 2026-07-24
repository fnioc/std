package foldtransform

import (
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

// lower runs the fold stage over src and returns the reprinted output plus whether
// the output SourceFile pointer was preserved (a no-op).
func lower(t *testing.T, src string) (string, bool) {
	t.Helper()
	sf := inlinetransform.SideParse("/fold/main.ts", src)
	shimast.SetParentInChildrenUnset(sf.AsNode())
	transform := New(nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := transform(ec, sf)
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(out.AsNode(), out, writer, nil)
	return writer.String(), out == sf
}

// TestFoldTrueTakesWhenTrue: `true ? A : B` folds to A.
func TestFoldTrueTakesWhenTrue(t *testing.T) {
	out, noop := lower(t, "const x = true ? a() : b();\n")
	if noop {
		t.Fatal("fold should have changed the file")
	}
	if !strings.Contains(out, "const x = a()") || strings.Contains(out, "b()") {
		t.Fatalf("`true ? a() : b()` should fold to `a()`:\n%s", out)
	}
}

// TestFoldFalseTakesWhenFalse: `false ? A : B` folds to B.
func TestFoldFalseTakesWhenFalse(t *testing.T) {
	out, _ := lower(t, "const x = false ? a() : b();\n")
	if !strings.Contains(out, "const x = b()") || strings.Contains(out, "a()") {
		t.Fatalf("`false ? a() : b()` should fold to `b()`:\n%s", out)
	}
}

// TestFoldNestedCollapsesInOnePass: `true ? (false ? x : y) : z` folds to `y` (the
// post-order visitor collapses the inner ternary before the outer).
func TestFoldNestedCollapsesInOnePass(t *testing.T) {
	out, _ := lower(t, "const x = true ? (false ? p() : q()) : r();\n")
	if !strings.Contains(out, "const x = q()") {
		t.Fatalf("nested boolean ternaries should collapse to `q()`:\n%s", out)
	}
	for _, gone := range []string{"p()", "r()", "?"} {
		if strings.Contains(out, gone) {
			t.Fatalf("expected %q pruned from:\n%s", gone, out)
		}
	}
}

// TestFoldNonLiteralConditionUntouched: a conditional whose condition is NOT a
// boolean literal is left exactly as-is (identity preserved).
func TestFoldNonLiteralConditionUntouched(t *testing.T) {
	out, noop := lower(t, "const x = cond ? a() : b();\n")
	if !noop {
		t.Fatalf("a non-literal-condition ternary must be a pointer-identity no-op; output:\n%s", out)
	}
	if !strings.Contains(out, "cond ? a() : b()") {
		t.Fatalf("non-literal ternary must be untouched:\n%s", out)
	}
}

// TestFoldParenWrappedConditionalDropsParen: the inline stage's precedence wrapper
// `(true ? A : B)` folds to A with the now-redundant paren dropped when A is
// self-delimiting (a call), matching the hand-written form.
func TestFoldParenWrappedConditionalDropsParen(t *testing.T) {
	out, _ := lower(t, "const x = (true ? a() : b());\n")
	if !strings.Contains(out, "const x = a();") {
		t.Fatalf("paren-wrapped `(true ? a() : b())` should fold to bare `a()`:\n%s", out)
	}
	if strings.Contains(out, "(a())") {
		t.Fatalf("the redundant wrapper paren should be dropped:\n%s", out)
	}
}

// TestFoldNoConditionalPreservesPointer: a file with no conditional at all comes
// back as the identical *SourceFile pointer — the loop-termination contract.
func TestFoldNoConditionalPreservesPointer(t *testing.T) {
	_, noop := lower(t, "const x = a();\n")
	if !noop {
		t.Fatal("a file with no boolean-literal conditional must be a pointer-identity no-op")
	}
}
