package mergesynthtransform

// A synthesized guard must key on a type's PUBLIC surface. A `#`-named field is
// not a string-keyed property at runtime, so a clause reading one can never be
// false — a guard built from such keys accepts objects that are not of the type
// at all. These pin that the guard keys on the accessors instead, and that the
// cases composition cannot reach are refused loudly rather than approximated.

import (
	"strings"
	"testing"
)

const accessorClassFixture = `
export class Opts {
  #value: number | undefined = undefined;
  public get value(): number | undefined { return this.#value; }
  public set value(v: number | undefined) { this.#value = v; }
  public plain: string = "x";
  private tsPriv: number = 1;
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, o: Opts | number): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`

// strategyText returns the emitted text from a member's strategy onward.
func strategyText(t *testing.T, out, memberName string) string {
	t.Helper()
	idx := strings.Index(out, memberName+":")
	if idx < 0 {
		t.Fatalf("no synthesized %s strategy:\n%s", memberName, out)
	}
	return out[idx:]
}

func TestGuardKeysOnPublicAccessorNotBackingField(t *testing.T) {
	out, diags := run(t, accessorClassFixture)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	guard := strategyText(t, out, "setOptions")

	if !strings.Contains(guard, "input.value") {
		t.Errorf("public accessor `value` absent from the guard:\n%s", guard)
	}
	if !strings.Contains(guard, "input.plain") {
		t.Errorf("public property `plain` absent from the guard:\n%s", guard)
	}
	if strings.Contains(guard, "tsPriv") {
		t.Errorf("guard keys on a `private`-modifier member:\n%s", guard)
	}
	// The union's other arm still dispatches.
	if !strings.Contains(guard, `"number" === typeof input`) {
		t.Errorf("the `number` arm of the union is not guarded:\n%s", guard)
	}
}

// A `#`-named key reaches the emit as the checker's mangled internal name, whose
// leading byte prints as the Unicode replacement character. No emitted artifact
// may ever carry one.
func TestNoMangledPrivateKeyReachesTheEmit(t *testing.T) {
	out, _ := run(t, accessorClassFixture)
	assertNoMangledKey(t, out)
}

func TestAccessorOnlyClassContributesRealClauses(t *testing.T) {
	out, diags := run(t, `
export class AccessorOnly {
  public get a(): number { return 1; }
  public get b(): string { return "x"; }
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, o: AccessorOnly): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	guard := strategyText(t, out, "setOptions")
	if !strings.Contains(guard, "input.a") || !strings.Contains(guard, "input.b") {
		t.Errorf("accessors contribute no guard clause — the object branch accepts anything:\n%s", guard)
	}
}

// An accessor-bearing class nested inside a plain interface composes through.
func TestNestedAccessorClassComposesThrough(t *testing.T) {
	out, diags := run(t, `
export class Opts {
  #value: number = 0;
  public get value(): number { return this.#value; }
}
export interface Wrapper { opts: Opts; label: string; }
export const AlphaExtensions = {
  setOptions(self: IAlpha, w: Wrapper): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	guard := strategyText(t, out, "setOptions")
	if !strings.Contains(guard, "input.opts") || !strings.Contains(guard, "input.value") {
		t.Errorf("the nested accessor class did not compose:\n%s", guard)
	}
	assertNoMangledKey(t, guard)
}

// An array of an accessor-bearing class composes element-wise.
func TestAccessorClassArrayComposesElementWise(t *testing.T) {
	out, diags := run(t, `
export class Opts {
  #value: number = 0;
  public get value(): number { return this.#value; }
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, all: Opts[]): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	guard := strategyText(t, out, "setOptions")
	if !strings.Contains(guard, "Array.isArray(input)") || !strings.Contains(guard, ".every(") {
		t.Errorf("the array was not decomposed element-wise:\n%s", guard)
	}
	if !strings.Contains(guard, "input.value") {
		t.Errorf("the element's accessor is not guarded:\n%s", guard)
	}
}

// A class with no public members at all cannot be guarded: refuse loudly and
// fall back to the always-pass strategy rather than emit a guard that passes
// everything while looking like it checks something.
func TestPrivateOnlyClassRefusesWithADiagnostic(t *testing.T) {
	out, diags := run(t, `
export class Sealed {
  #a: number = 0;
  #b: string = "";
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, o: Sealed): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	assertPrivateSurfaceWarning(t, diags)
	guard := strategyText(t, out, "setOptions")
	if strings.Contains(guard, "const g0") {
		t.Errorf("a guard was emitted for an unguardable type:\n%s", guard)
	}
	assertNoMangledKey(t, out)
}

// A diverging type inside a container the composer does not decompose is refused
// rather than approximated.
func TestDivergingTypeInsideAMapRefuses(t *testing.T) {
	out, diags := run(t, `
export class Opts {
  #value: number = 0;
  public get value(): number { return this.#value; }
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, all: Map<string, Opts>): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	assertPrivateSurfaceWarning(t, diags)
	guard := strategyText(t, out, "setOptions")
	if strings.Contains(guard, "const g0") {
		t.Errorf("a guard was emitted for an unguardable type:\n%s", guard)
	}
}

// The fast path is untouched: a type with a wholly ordinary public surface still
// goes straight to typia, with no diagnostic.
func TestAllPublicClassTakesTheUnchangedFastPath(t *testing.T) {
	out, diags := run(t, `
export class Plain {
  public host: string = "";
  public port: number = 0;
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, o: Plain): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	guard := strategyText(t, out, "setOptions")
	// typia's own object programmer names its per-object helper `_io0`; the
	// composed path never emits one.
	if !strings.Contains(guard, "_io0") {
		t.Errorf("the fast path did not run for an all-public class:\n%s", guard)
	}
}

func assertNoMangledKey(t *testing.T, out string) {
	t.Helper()
	if strings.ContainsRune(out, '�') || strings.Contains(out, `�`) {
		t.Errorf("a mangled private-identifier key reached the emit:\n%s", out)
	}
	if strings.Contains(out, "@#") {
		t.Errorf("a private-identifier index key reached the emit:\n%s", out)
	}
}

func assertPrivateSurfaceWarning(t *testing.T, diags []Diagnostic) {
	t.Helper()
	for _, d := range diags {
		if d.Code == "MERGESYNTH_PRIVATE_SURFACE" {
			if d.Category != Warning {
				t.Errorf("MERGESYNTH_PRIVATE_SURFACE is %v; want Warning", d.Category)
			}
			return
		}
	}
	t.Errorf("no MERGESYNTH_PRIVATE_SURFACE diagnostic; got %+v", diags)
}
