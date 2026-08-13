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
	a.FunctionSugars = append(a.FunctionSugars, &Resolved{Member: "tokenOf", Module: "p"})
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
		a.FunctionSugars = append(a.FunctionSugars, &Resolved{Member: "tokenOf", Module: "p"})
		if diags := Sweep(sf, a); len(diags) != 0 {
			t.Fatalf("a free-function call whose import was elided must not be flagged, got %+v", diags)
		}
	})
}

// TestSweepIgnoresSameNameFromAnotherModule: a free-function sugar is identified by
// its declaring package, not by its spelling. A call to a same-named function
// imported from somewhere else is a different function — the pairing a sugar body
// that forwards to its own runtime namesake makes ordinary.
func TestSweepIgnoresSameNameFromAnotherModule(t *testing.T) {
	sf := parse(t, "/sweep/other-module.ts", `import { tokenOf } from 'q';
export const v = tokenOf(1);
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	if diags := Sweep(sf, activeResidueArtifacts()); len(diags) != 0 {
		t.Fatalf("a same-named function from another module is not the sugar, got %+v", diags)
	}
}

// TestSweepFlagsSugarFromItsDeclaringModule is the same shape from the package that
// DOES declare the sugar: the call is the sugar, un-lowered, and must be flagged.
func TestSweepFlagsSugarFromItsDeclaringModule(t *testing.T) {
	sf := parse(t, "/sweep/own-module.ts", `import { tokenOf } from 'p';
export const v = tokenOf(1);
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	diags := Sweep(sf, activeResidueArtifacts())
	if len(diags) != 1 || diags[0].Code != "INLINE_UNLOWERED_SUGAR" {
		t.Fatalf("want one INLINE_UNLOWERED_SUGAR, got %+v", diags)
	}
}

// TestSweepIgnoresRuntimeForwardingTarget: a floater's body may forward its
// calls to a same-named runtime function in another package (the substitution
// mechanism materializes an import from that package). A surviving call to
// THAT target is never mistaken for sugar residue — only a call importing the
// name from the floater's OWN declaring package (Module) is.
func TestSweepIgnoresRuntimeForwardingTarget(t *testing.T) {
	sf := parse(t, "/sweep/forward-target.ts", `import { tokenOf } from 'runtime-pkg';
export const v = tokenOf(1);
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	a := NewArtifacts()
	a.Active = true
	a.FunctionSugars = append(a.FunctionSugars, &Resolved{Member: "tokenOf", Module: "p"})
	if diags := Sweep(sf, a); len(diags) != 0 {
		t.Fatalf("a call to the runtime forwarding target must not be flagged, got %+v", diags)
	}
}

// TestSugarShapeMatches is a table test of the arity-matching rule itself:
// a non-rest shape matches only its exact (type-arg, value-arg) counts; a
// rest-parameter shape (as every di.extras Manifest sugar body is —
// `<T>(this, ...rest: any[])`, recorded as ValueArgCount 1 for the rest slot
// itself) matches any value-arg count at or above its leading-parameter count,
// but keeps type-argument count exact on both branches.
func TestSugarShapeMatches(t *testing.T) {
	nonRest := MemberShape{TypeArgCount: 1, ValueArgCount: 0}
	rest := MemberShape{TypeArgCount: 1, ValueArgCount: 1, HasRest: true}

	cases := []struct {
		name      string
		shape     MemberShape
		typeArgs  int
		valueArgs int
		want      bool
	}{
		{"non-rest exact match", nonRest, 1, 0, true},
		{"non-rest wrong value-arg count", nonRest, 1, 1, false},
		{"non-rest wrong type-arg count", nonRest, 0, 0, false},

		// A rest body's ValueArgCount (1) counts the rest slot itself, so its
		// leading-parameter floor is 0 — every value-arg count from 0 up matches.
		{"rest at recorded arity", rest, 1, 1, true},
		{"rest below recorded arity (addClass<T>(Impl, sigs) shape)", rest, 1, 2, true},
		{"rest well above recorded arity", rest, 1, 4, true},
		{"rest at the floor (zero value args)", rest, 1, 0, true},
		// Zero type arguments is the SUBSTITUTION OUTPUT shape
		// (`this.addClass(typefor<T>(), ...rest)` lowers its own explicit type
		// argument away), not surviving sugar — must not match regardless of
		// value-arg count.
		{"rest with zero type args is the lowered form, not residue", rest, 0, 2, false},
		{"rest with more type args than certified", rest, 2, 2, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := sugarShapeMatches(c.shape, c.typeArgs, c.valueArgs)
			if got != c.want {
				t.Errorf("sugarShapeMatches(%+v, typeArgs=%d, valueArgs=%d) = %v, want %v",
					c.shape, c.typeArgs, c.valueArgs, got, c.want)
			}
		})
	}
}

// TestSweepFlagsRestSugarAtAnyArity is the sweep-level proof of the fix: a
// certified rest-parameter sugar shape (the addClass/addFactory/... family,
// recorded as TypeArgCount 1 / ValueArgCount 1 / HasRest true, since every
// di.extras Manifest sugar body is `<T>(this, ...rest: any[])`) must be flagged
// at a value-arg count the recorded shape never equals — the real
// addClass<T>(ctor, signatures) call shape a strict-equality check can never
// reach, since the recorded count is 1 — as long as it still spells its
// explicit type argument.
func TestSweepFlagsRestSugarAtAnyArity(t *testing.T) {
	sf := parse(t, "/sweep/rest-residue.ts", `declare const m: any;
declare const Impl: any;
declare const sigs: any;
const a = m.addClass<Impl>(Impl, sigs);
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	a := NewArtifacts()
	a.Active = true
	a.SugarMembers["addClass"] = MemberShape{TypeArgCount: 1, ValueArgCount: 1, HasRest: true}

	diags := Sweep(sf, a)
	if len(diags) != 1 || diags[0].Code != "INLINE_UNLOWERED_SUGAR" {
		t.Fatalf("want exactly 1 INLINE_UNLOWERED_SUGAR for the 2-value-arg explicit-type-argument call, got %+v", diags)
	}
}

// TestSweepIgnoresLoweredRestSugarOutput is the regression the ttsc e2e gate
// caught and the unit tests above missed: the inline stage's OWN substitution
// output for a rest-parameter sugar body — a property-access call on the same
// member name, its explicit type argument already consumed into a token
// argument, several value arguments — must never be flagged. This is exactly
// what a correctly lowered `addClass<ILogger>(ConsoleLogger, sigs)` call looks
// like on disk: `services.addClass(Type.global(...), ConsoleLogger, sigs)`.
func TestSweepIgnoresLoweredRestSugarOutput(t *testing.T) {
	sf := parse(t, "/sweep/lowered-output.ts", `declare const services: any;
declare const token: any;
declare const ConsoleLogger: any;
declare const sigs: any;
export const closed = (services as any).addClass(token, ConsoleLogger, sigs, 'singleton');
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	a := NewArtifacts()
	a.Active = true
	a.SugarMembers["addClass"] = MemberShape{TypeArgCount: 1, ValueArgCount: 1, HasRest: true}

	if diags := Sweep(sf, a); len(diags) != 0 {
		t.Fatalf("a correctly lowered zero-type-arg call must not be flagged as residue, got %+v", diags)
	}
}

// TestSweepFlagsCoveredNonRestShapeUnchanged is the regression guard for the
// existing exact-arity cases: a non-rest shape (the ServiceProvider
// getService/getRequiredService/getServices family, recorded with HasRest
// false) keeps flagging only its exact recorded shape after the arity-matching
// rule changed, and keeps ignoring a different arity.
func TestSweepFlagsCoveredNonRestShapeUnchanged(t *testing.T) {
	sf := parse(t, "/sweep/non-rest.ts", `declare const x: any;
const matches = x.isService<Foo>();
const mismatches = x.isService<Foo>('token');
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	a := NewArtifacts()
	a.Active = true
	a.SugarMembers["isService"] = MemberShape{TypeArgCount: 1, ValueArgCount: 0}

	diags := Sweep(sf, a)
	if len(diags) != 1 || diags[0].Code != "INLINE_UNLOWERED_SUGAR" {
		t.Fatalf("want exactly 1 INLINE_UNLOWERED_SUGAR for the exact-shape call only, got %+v", diags)
	}
}

// TestSweepIgnoresUnregisteredSameNameMember: a call whose callee name does not
// resolve to any registered sugar member at all (no entry in SugarMembers) is
// left alone regardless of its arity — the widened arity rule only relaxes
// matching for a CERTIFIED shape, it never starts matching on name alone.
func TestSweepIgnoresUnregisteredSameNameMember(t *testing.T) {
	sf := parse(t, "/sweep/unregistered.ts", `declare const m: any;
declare const Impl: any;
declare const sigs: any;
const a = m.addClass(Impl, sigs);
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())

	a := NewArtifacts()
	a.Active = true
	// addClass is deliberately NOT registered in SugarMembers here.
	if diags := Sweep(sf, a); len(diags) != 0 {
		t.Fatalf("a call to a member with no certified sugar shape must not be flagged, got %+v", diags)
	}
}
