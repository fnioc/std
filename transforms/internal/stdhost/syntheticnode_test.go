package stdhost

import (
	"strings"
	"testing"
)

// This file pins a LIVE, UNFIXED defect: the typescript-go checker nil-derefs
// when it is asked to contextually type an object literal a transform pass
// minted. It is the crash that motivated the panic recovery in host.go, and it
// is reachable from ordinary authored code, so it is pinned here rather than
// left as folklore.
//
// THE MECHANISM. A slot for an OPTIONAL (or defaulted) constructor parameter
// lowers to a union slot — the object literal `{ union: [token, { value: void 0
// }] }` — which the signatures engine mints through the emit factory. A minted
// node was never seen by the binder, so it carries no symbol. On the NEXT pass of
// the fixed-point loop a stage asks the checker about the enclosing call chain
// (nameof resolves the callee's symbol, the inline stage resolves the callee's
// signature); resolving that reaches the receiver's overload resolution, which
// contextually types the minted object literal's property assignment, and
// checker.getContextualTypeForObjectLiteralElement dereferences the symbol it
// assumes every element has:
//
//	symbol := c.getSymbolOfDeclaration(element)          // nil for a minted node
//	return c.getTypeOfPropertyOfContextualTypeEx(t, symbol.Name, …)  // nil deref
//
// So it takes BOTH halves: a minted object literal in the argument list AND a
// later checker query over the chain that contains it. The control cases below
// carry the first without the second and lower cleanly.
//
// The engine-side fix is not local — every stage resolves against the shared
// checker, and the loop hands it a tree it has already rewritten, so the general
// repair is to resolve on the pristine tree once instead of on each pass. That is
// an architecture change, deliberately not made here. What IS fixed here is the
// REPORT: the crash arrives as a diagnostic naming the file and the stage.
//
// WHEN THESE TESTS START FAILING, the defect is fixed (a newer vendored checker,
// or the engine stopped re-querying a rewritten tree). Promote them: drop the
// panic expectation and assert the lowered output instead.

// syntheticFixturePkg is the consumer manifest for the fixture below — a
// dependency-free root, so CollectProject resolves nothing and the run needs no
// built dist, no inline bodies, and no ttsc spawn.
const syntheticFixturePkg = `{"name":"@rhombus-std/synthetic-fixture","version":"0.0.0","private":true}`

// syntheticDiStub is a local stand-in for the registration surface: the slot
// grammar (a union slot is an object literal), the `signatureof(ctor)` primitive
// the stage anchors on by symbol name, and a chain whose members take VALUE
// arguments. Nothing here resolves off disk.
const syntheticDiStub = `export type Token = string;
export interface Union { readonly union: readonly DepSlot[] }
export interface LiteralRef { readonly value: unknown }
export type DepSlot = Token | Union | LiteralRef;
export type DepSignatures = ReadonlyArray<readonly DepSlot[]>;
export type Ctor = new (...args: never[]) => object;
export declare function signatureof(value: unknown): DepSignatures;
export interface IChain {
  withSignature(...slots: readonly DepSlot[]): IChain;
  withSignatures(...signatures: ReadonlyArray<readonly DepSlot[]>): IChain;
  as(scope: string): IChain;
  build(): unknown;
}
export interface IManifest {
  addClass(token: Token, ctor: Ctor, signatures: DepSignatures): IChain;
}
export declare const manifest: IManifest;
`

// syntheticPrelude declares the class whose OPTIONAL second constructor
// parameter is what makes the derived signature carry a union slot — and so an
// object literal — at all. With both parameters required the derived signature is
// two bare token strings, there is no object literal to contextually type, and
// none of these shapes crashes.
const syntheticPrelude = `import { manifest, signatureof } from "./di";

export interface IClock {}
export interface IOptions {}

export class Widget {
  public constructor(clock: IClock, options?: IOptions) {
    void clock;
    void options;
  }
}

`

// syntheticFixture assembles the two-file fixture around one registration
// statement.
func syntheticFixture(registration string) map[string]string {
	return map[string]string{
		"src/di.ts":  syntheticDiStub,
		"src/app.ts": syntheticPrelude + registration,
	}
}

// TestSyntheticObjectLiteralPanicsTheChecker drives the two shapes that reach the
// defect: a minted union slot in the argument list, plus a trailing chain call
// the next pass asks the checker about. Both must arrive as a STAGE_PANIC naming
// the source file — never as a process that dies with an unattributed Go stack.
func TestSyntheticObjectLiteralPanicsTheChecker(t *testing.T) {
	crashing := map[string]string{
		// The smallest shape there is: one trailing scope call.
		"trailing as": `export const m = manifest.addClass("pkg:Widget", Widget, signatureof(Widget)).as("singleton");`,
		// A trailing single-slot append reaches it the same way.
		"trailing withSignature": `export const m = manifest.addClass("pkg:Widget", Widget, signatureof(Widget)).withSignature("pkg:IClock");`,
	}
	for name, registration := range crashing {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			writeFixture(t, dir, syntheticFixturePkg, syntheticFixture(registration))

			env, stderr, code := driveHost(t, dir, `[]`)
			if code == 0 {
				t.Fatalf("this shape no longer reaches the checker defect — the underlying bug is FIXED. Promote this test: assert the lowered output instead of the panic.\nlowered: %s", env.TypeScript["src/app.ts"])
			}
			got := findDiag(env, stagePanicCode)
			if got == nil {
				t.Fatalf("the run failed WITHOUT a %s diagnostic; diagnostics = %+v\nstderr: %s", stagePanicCode, env.Diagnostics, stderr)
			}
			if got.File == nil || !strings.HasSuffix(*got.File, "src/app.ts") {
				t.Fatalf("%s must name the file that crashed; file = %v", stagePanicCode, got.File)
			}
			if !strings.Contains(got.MessageText, "invalid memory address or nil pointer dereference") {
				t.Errorf("expected the checker nil-deref; message =\n%s", got.MessageText)
			}
			if !strings.Contains(got.MessageText, "getContextualTypeForObjectLiteralElement") {
				t.Errorf("the crash moved off getContextualTypeForObjectLiteralElement — re-read this file's mechanism note; message =\n%s", got.MessageText)
			}
		})
	}
}

// TestSyntheticObjectLiteralAloneIsHarmless is the control: the SAME minted union
// slot, with nothing chained after the registration for a later pass to ask the
// checker about, lowers cleanly. It is what proves the trigger is the second
// query over a rewritten tree, not the union slot on its own — without it, a
// fixture that failed to mint the object literal at all would still look like a
// passing pin above.
func TestSyntheticObjectLiteralAloneIsHarmless(t *testing.T) {
	dir := t.TempDir()
	writeFixture(t, dir, syntheticFixturePkg, syntheticFixture(
		`export const m = manifest.addClass("pkg:Widget", Widget, signatureof(Widget));`,
	))

	env, stderr, code := driveHost(t, dir, `[]`)
	if code != 0 {
		t.Fatalf("an unchained registration must lower cleanly; code = %d\ndiagnostics = %+v\nstderr: %s", code, env.Diagnostics, stderr)
	}
	lowered := loweredApp(t, env)
	if !strings.Contains(lowered, "union:") {
		t.Fatalf("the fixture did not mint the union slot the crashing cases depend on — the pin above would be vacuous:\n%s", lowered)
	}
	if strings.Contains(lowered, "signatureof") {
		t.Fatalf("signatureof survived lowering:\n%s", lowered)
	}
}
