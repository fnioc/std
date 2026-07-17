package signaturetransform

import (
	"strings"
	"testing"

	"github.com/fnioc/std/transforms/internal/ditransform"
)

// holeBrands declares the `$<N>` hole brand the open-generic registration grammar
// uses, so a value's dependency signature can reference a template hole.
const holeBrands = `declare const HOLE: unique symbol;
type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
type $<N extends number> = Hole<N>;
`

// TestRegistrationDepHoleErrorsOnInlinePath is the dep-hole fix (#236 finding #1):
// a fully-lowered `services.add("token", Ctor<$<N>>, signatureof(Ctor<$<N>>))` —
// the shape the inline `add<T>()` sugar lowers to — whose dependency references a
// hole the service token does NOT bind must raise 990010 on the signatureof path,
// at parity with the di stage's direct `add<I>(C)` lowering. Before the fix the
// signatureof stage lowered the third argument through the UNCHECKED SignatureArray
// (the token was out of scope), silently emitting the array with no error; the
// enclosing-call token recovery restores the check. The token here binds $1 only,
// while SqlRepo<$<2>>'s constructor references $2.
func TestRegistrationDepHoleErrorsOnInlinePath(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
` + holeBrands + `interface IRepo<T> {}
class SqlRepo<T> implements IRepo<$<1>> { constructor(seed: T) { void seed; } }
declare const services: { add(token: string, ctor: unknown, sig?: unknown): unknown };
services.add("m:IRepo<$1>", SqlRepo<$<2>>, signatureof(SqlRepo<$<2>>));
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	_, diags := lowerMain(t, prog, app)
	found := false
	for _, d := range diags {
		if d.Code == "990010" && d.Category == ditransform.Error {
			found = true
			if !strings.Contains(d.Message, "$2") {
				t.Errorf("990010 message should name the orphan hole $2, got %q", d.Message)
			}
		}
	}
	if !found {
		t.Fatalf("expected a 990010 dep-hole error on the inline registration path, got %+v", diags)
	}
}

// TestRegistrationDepHoleBoundIsClean is the negative half: the SAME value under a
// token that DOES bind the referenced hole ($2) raises no 990010, and the emitted
// dependency-signature array is byte-identical to the one the UNCHECKED standalone
// signatureof path produces for the same value — the check reports, it never
// rewrites, so valid inputs are unchanged.
func TestRegistrationDepHoleBoundIsClean(t *testing.T) {
	registered := `import { signatureof } from '@scope/prims';
` + holeBrands + `interface IRepo<T> {}
class SqlRepo<T> implements IRepo<$<1>> { constructor(seed: T) { void seed; } }
declare const services: { add(token: string, ctor: unknown, sig?: unknown): unknown };
services.add("m:IRepo<$2>", SqlRepo<$<2>>, signatureof(SqlRepo<$<2>>));
`
	standalone := `import { signatureof } from '@scope/prims';
` + holeBrands + `interface IRepo<T> {}
class SqlRepo<T> implements IRepo<$<1>> { constructor(seed: T) { void seed; } }
export const s = signatureof(SqlRepo<$<2>>);
`
	regProg, regApp := buildSigWorkspace(t, registered)
	defer func() { _ = regProg.Close() }()
	regOut, regDiags := lowerMain(t, regProg, regApp)
	for _, d := range regDiags {
		if d.Code == "990010" {
			t.Fatalf("a bound dep hole must not raise 990010, got %+v", d)
		}
	}

	soProg, soApp := buildSigWorkspace(t, standalone)
	defer func() { _ = soProg.Close() }()
	soOut, _ := lowerMain(t, soProg, soApp)

	regArr := depArray(t, regOut)
	soArr := depArray(t, soOut)
	if regArr != soArr {
		t.Fatalf("checked registration array %q != unchecked standalone array %q", regArr, soArr)
	}
}

// depArray extracts the `[[...]]` dependency-signature array literal from a lowered
// output (the only doubly-bracketed literal the signatureof stage emits).
func depArray(t *testing.T, out string) string {
	t.Helper()
	start := strings.Index(out, "[[")
	if start < 0 {
		t.Fatalf("no dependency array in output:\n%s", out)
	}
	depth := 0
	for i := start; i < len(out); i++ {
		switch out[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return out[start : i+1]
			}
		}
	}
	t.Fatalf("unterminated dependency array in output:\n%s", out)
	return ""
}
