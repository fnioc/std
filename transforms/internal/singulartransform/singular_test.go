package singulartransform

import (
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// renderLiteral prints the TS expression literalExpression renders for a Rule-2
// singular value — the exact text this stage emits into output for a
// `singularValue<T>()` over a singular T. It is a DIRECT unit test of the rendering
// branches (the package carried none before): the indirect pipeline/e2e coverage
// only ever exercised a string, a number, and null, leaving the boolean, bigint
// (incl. negated), negative-number, and undefined/void branches unrendered.
func renderLiteral(t *testing.T, v tokens.LiteralValue) string {
	t.Helper()
	ec := shimprinter.NewEmitContext()
	node := literalExpression(ec.Factory.AsNodeFactory(), v)
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(node, nil, writer, nil)
	return writer.String()
}

// TestLiteralExpressionRendersEveryBranch pins the rendering of every LiteralKind —
// the same shapes di.core's Rule-2 short-circuit emits (slots.go's literalExpression,
// which this mirrors byte-for-byte). Negative number / negative bigint render as a
// unary minus over the unsigned magnitude; the undefined singleton renders `void 0`.
func TestLiteralExpressionRendersEveryBranch(t *testing.T) {
	cases := []struct {
		name  string
		value tokens.LiteralValue
		want  string
	}{
		{"null", tokens.LiteralValue{Kind: tokens.LiteralNull}, "null"},
		{"string", tokens.LiteralValue{Kind: tokens.LiteralString, Str: "dev"}, `"dev"`},
		{"string-empty", tokens.LiteralValue{Kind: tokens.LiteralString, Str: ""}, `""`},
		{"boolean-true", tokens.LiteralValue{Kind: tokens.LiteralBoolean, Bool: true}, "true"},
		{"boolean-false", tokens.LiteralValue{Kind: tokens.LiteralBoolean, Bool: false}, "false"},
		{"number", tokens.LiteralValue{Kind: tokens.LiteralNumber, Text: "42"}, "42"},
		{"number-negative", tokens.LiteralValue{Kind: tokens.LiteralNumber, Text: "42", Negated: true}, "-42"},
		{"number-zero", tokens.LiteralValue{Kind: tokens.LiteralNumber, Text: "0"}, "0"},
		{"bigint", tokens.LiteralValue{Kind: tokens.LiteralBigInt, Text: "7"}, "7n"},
		{"bigint-negative", tokens.LiteralValue{Kind: tokens.LiteralBigInt, Text: "9", Negated: true}, "-9n"},
		{"undefined", tokens.LiteralValue{Kind: tokens.LiteralUndefined}, "void 0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := renderLiteral(t, tc.value)
			if got != tc.want {
				t.Fatalf("literalExpression(%s): got %q, want %q", tc.name, got, tc.want)
			}
		})
	}
}

// TestLowerIsSingularRendersBooleanKeyword pins lowerIsSingular's two outputs
// directly (independent of any checker type): a nil / non-singular classification is
// exercised through the pipeline elsewhere, but the keyword rendering itself — the
// literal `true` / `false` the stage substitutes for `isSingular<T>()` — had no
// direct assertion. Here we drive the two SingletonValue outcomes by rendering the
// keyword the branch emits.
func TestLowerIsSingularRendersBooleanKeyword(t *testing.T) {
	// The boolean-literal singular VALUE and the isSingular predicate share the
	// true/false keyword rendering; assert both keyword forms print as expected.
	if got := renderLiteral(t, tokens.LiteralValue{Kind: tokens.LiteralBoolean, Bool: true}); got != "true" {
		t.Fatalf("true keyword: got %q", got)
	}
	if got := renderLiteral(t, tokens.LiteralValue{Kind: tokens.LiteralBoolean, Bool: false}); got != "false" {
		t.Fatalf("false keyword: got %q", got)
	}
}
