package signaturetransform

import (
	"strings"
	"testing"
)

// TestNewLowersComplexDepShapes drives the signatures extractor through the
// dependency-parameter shapes the simpler TestNewLowersDepSlotKinds does not
// reach — the branches the deleted di.transformer.ttsc.e2e corpus used to
// exercise (W6p3 removed that oracle suite; these Go cases replace its coverage
// of the extractor's shape derivation):
//
//   - an inline function-type param  → factorySlotFor / signatureOfFunctionTypeNode
//     lowers to a `{ type, params }` factory slot;
//   - a tuple rest param             → expandRestParam / tupleElementSlots flattens
//     the tuple into positional slots in one signature;
//   - a union-of-tuples rest param   → expandRestParam's union branch yields ONE
//     signature per tuple member;
//   - an optional param              → nonNullishMemberSlots wraps the derived slot
//     with a trailing `{ value: void 0 }` in a `union` slot;
//   - an inline union param          → the syntactic-union path (overrideMatchesSyntacticUnion
//     / unionMemberOverrides / extractParamSlotFromTypeNode) lowers to a `union` slot;
//   - an inline arrow VALUE          → extractSignatureFromFunction reads the arrow's
//     own params;
//   - a declaration-less ctor VALUE  → extractCtorReferenceSignature reads the
//     `new (...) => T` construct signature.
//
// Every shape derives cleanly (no diagnostic), no primitive call survives, and the
// emitted signature array is byte-checked against the extractor's output.
func TestNewLowersComplexDepShapes(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
interface IDep {}
interface IOther {}
interface IThing {}
class FnParam { constructor(make: (d: IDep) => IThing) { void make; } }
class TupleRest { constructor(...deps: [IDep, IOther]) { void deps; } }
class UnionRest { constructor(...deps: [IDep] | [IDep, IOther]) { void deps; } }
class OptParam { constructor(dep?: IDep) { void dep; } }
class UnionParam { constructor(dep: IDep | IOther) { void dep; } }
declare const Ctor: new (d: IDep) => IThing;
export const fnParam = signatureof(FnParam);
export const tupleRest = signatureof(TupleRest);
export const unionRest = signatureof(UnionRest);
export const optParam = signatureof(OptParam);
export const unionParam = signatureof(UnionParam);
export const arrowValue = signatureof((x: IDep) => ({} as IThing));
export const ctorValue = signatureof(Ctor);
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if strings.Contains(out, "signatureof") {
		t.Errorf("a signatureof reference survived lowering:\n%s", out)
	}

	want := map[string]string{
		// Inline function-type param → factory slot.
		"fnParam": `export const fnParam = [[{ type: "@scope/app/main:IThing", params: ["@scope/app/main:IDep"] }]];`,
		// Tuple rest → flattened positional slots, one signature.
		"tupleRest": `export const tupleRest = [["@scope/app/main:IDep", "@scope/app/main:IOther"]];`,
		// Union-of-tuples rest → one signature per union member.
		"unionRest": `export const unionRest = [["@scope/app/main:IDep"], ["@scope/app/main:IDep", "@scope/app/main:IOther"]];`,
		// Optional param → derived slot with a trailing `{ value: void 0 }` union member.
		"optParam": `export const optParam = [[{ union: ["@scope/app/main:IDep", { value: void 0 }] }]];`,
		// Inline union param → `union` slot over both members.
		"unionParam": `export const unionParam = [[{ union: ["@scope/app/main:IDep", "@scope/app/main:IOther"] }]];`,
		// Inline arrow value → the arrow's own param signature.
		"arrowValue": `export const arrowValue = [["@scope/app/main:IDep"]];`,
		// Declaration-less ctor reference → its construct-signature params.
		"ctorValue": `export const ctorValue = [["@scope/app/main:IDep"]];`,
	}
	for name, line := range want {
		if !strings.Contains(out, line) {
			t.Errorf("%s: expected line not found:\n  want: %s\n  full output:\n%s", name, line, out)
		}
	}
}
