package inlinetransform

import (
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// residueSource is one file carrying all three residue shapes the sweep flags
// plus a live `import { tokenOf } from 'p'` that anchors the free-function check.
const residueSource = `import { tokenOf } from 'p';
declare const x: any;
const a = tokenfor<Foo>();
const b = x.isService<Foo>();
const c = tokenOf(1);
`

// activeResidueArtifacts is the artifact state a real run hands the sweep for the
// residue file: the inline stage was active, isService is a certified 1-type-arg /
// 0-value-arg member sugar, and tokenOf is a certified free-function sugar from p.
func activeResidueArtifacts() *Artifacts {
	a := NewArtifacts()
	a.Active = true
	a.SugarMembers["isService"] = MemberShape{TypeArgCount: 1, ValueArgCount: 0}
	a.SugarFunctions["tokenOf"] = "p"
	return a
}

// TestSweepFlagsResidue is emit tripwire 2's positive case: a fully "lowered"
// file in which a registered primitive, a certified member-sugar call, and a
// certified free-function call all survived. The sweep must fire exactly one
// diagnostic per surviving call, with the right code for each shape.
func TestSweepFlagsResidue(t *testing.T) {
	sf := parse(t, "/sweep/residue.ts", residueSource)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	diags := Sweep(sf, activeResidueArtifacts())
	if len(diags) != 3 {
		t.Fatalf("expected 3 diagnostics (tokenfor primitive, isService member sugar, tokenOf free-fn sugar), got %d: %+v", len(diags), diags)
	}

	codes := map[string]int{}
	for _, d := range diags {
		codes[d.Code]++
	}
	if codes["INLINE_UNLOWERED_PRIMITIVE"] != 1 {
		t.Errorf("want 1 INLINE_UNLOWERED_PRIMITIVE (the surviving tokenfor<Foo>()), got %d: %+v", codes["INLINE_UNLOWERED_PRIMITIVE"], diags)
	}
	if codes["INLINE_UNLOWERED_SUGAR"] != 2 {
		t.Errorf("want 2 INLINE_UNLOWERED_SUGAR (isService member + tokenOf free-fn), got %d: %+v", codes["INLINE_UNLOWERED_SUGAR"], diags)
	}
}

// TestSweepFlagsRegisteredPrimitiveNode covers the sweep's first branch: a call
// still carried in artifacts.PrimitiveCalls (a substituted primitive the tokenfor
// stage never lowered) is flagged INLINE_UNLOWERED_PRIMITIVE by node identity,
// independent of its callee text or shape.
func TestSweepFlagsRegisteredPrimitiveNode(t *testing.T) {
	sf := parse(t, "/sweep/registered.ts", `const d = plain();
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	// `plain()` matches no primitive/sugar shape on its own — only its presence in
	// PrimitiveCalls makes the sweep flag it.
	registered := callContaining(t, sf, "plain(")
	artifacts := NewArtifacts()
	artifacts.Active = true
	artifacts.PrimitiveCalls[registered] = PrimitiveUse{Name: "tokenfor"}

	diags := Sweep(sf, artifacts)
	if len(diags) != 1 || diags[0].Code != "INLINE_UNLOWERED_PRIMITIVE" {
		t.Fatalf("expected 1 INLINE_UNLOWERED_PRIMITIVE from the registered-node branch, got %+v", diags)
	}
}

// TestSweepStaysQuiet pins the three silence contracts: an inactive run, a
// member-sugar call whose shape does not match the certified shape, and a
// free-function call whose import binding was already elided.
func TestSweepStaysQuiet(t *testing.T) {
	t.Run("inactive artifacts short-circuit to nil", func(t *testing.T) {
		sf := parse(t, "/sweep/inactive.ts", residueSource)
		shimast.SetParentInChildrenUnset(sf.AsNode())
		a := activeResidueArtifacts()
		a.Active = false
		if diags := Sweep(sf, a); diags != nil {
			t.Fatalf("an inactive run must return nil, got %+v", diags)
		}
	})

	t.Run("member-sugar shape mismatch is not flagged", func(t *testing.T) {
		// The certified isService shape is (1 type arg, 0 value args). This call
		// carries a value argument, so it is a primitive-form call, not surviving
		// sugar — the sweep must leave it alone.
		sf := parse(t, "/sweep/shape.ts", `declare const x: any;
const b = x.isService<Foo>('token');
`)
		shimast.SetParentInChildrenUnset(sf.AsNode())
		a := NewArtifacts()
		a.Active = true
		a.SugarMembers["isService"] = MemberShape{TypeArgCount: 1, ValueArgCount: 0}
		if diags := Sweep(sf, a); len(diags) != 0 {
			t.Fatalf("a shape-mismatched member call must not be flagged, got %+v", diags)
		}
	})

	t.Run("free-function call with its import already elided is not flagged", func(t *testing.T) {
		// The inline stage elides the import of an inlined free function; a bare
		// tokenOf() call with no surviving import binding is a first-party stranger,
		// not residue.
		sf := parse(t, "/sweep/elided.ts", `const c = tokenOf(1);
`)
		shimast.SetParentInChildrenUnset(sf.AsNode())
		a := NewArtifacts()
		a.Active = true
		a.SugarFunctions["tokenOf"] = "p"
		if diags := Sweep(sf, a); len(diags) != 0 {
			t.Fatalf("a free-function call whose import was elided must not be flagged, got %+v", diags)
		}
	})
}

// TestSweepFlagsSurvivingSingularValue covers the §94 targeted-diagnostic branch: a
// registered `singularValue<T>()` that SURVIVED lowering (the singular stage left it
// un-lowered over a non-singular type, and no fold pruned it) is flagged with the
// specific SINGULAR_VALUE_NON_SINGULAR code — naming the failure — not the generic
// INLINE_UNLOWERED_PRIMITIVE. A guarded singularValue is pruned before the sweep, so
// one that reaches here is unguarded over a non-singular type.
func TestSweepFlagsSurvivingSingularValue(t *testing.T) {
	sf := parse(t, "/sweep/singular.ts", `const s = singularValue<Foo>();
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	registered := callContaining(t, sf, "singularValue<")
	artifacts := NewArtifacts()
	artifacts.Active = true
	artifacts.PrimitiveCalls[registered] = PrimitiveUse{Name: "singularValue"}

	diags := Sweep(sf, artifacts)
	if len(diags) != 1 || diags[0].Code != "SINGULAR_VALUE_NON_SINGULAR" {
		t.Fatalf("expected 1 SINGULAR_VALUE_NON_SINGULAR from the surviving-singularValue branch, got %+v", diags)
	}
}
