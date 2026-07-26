package mergesynthtransform

// Probes pinning the synthesized guard for a parameter typed as a class whose
// public surface is accessors over ECMAScript `#private` backing fields. A
// `#private` field is not a string-keyed property at runtime, so a guard clause
// keyed on one can never be false — it degenerates to a pass. These record the
// guard actually emitted, and whether the checker's private-identifier key is
// stable across programs in one process.

import (
	"regexp"
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

// privateKeyPattern matches the checker's private-identifier property key as it
// reaches the emitted guard: a replacement char, the owning checker node id, and
// the `@#name` suffix.
var privateKeyPattern = regexp.MustCompile(`\\uFFFD#(\d+)@#(\w+)`)

// TestProbeGuardKeysOnPrivateBackingField: the emitted guard must key on the
// public accessor, never on the `#private` backing field behind it.
func TestProbeGuardKeysOnPrivateBackingField(t *testing.T) {
	out, diags := run(t, accessorClassFixture)
	if len(diags) != 0 {
		t.Logf("diagnostics: %+v", diags)
	}
	idx := strings.Index(out, "setOptions:")
	if idx < 0 {
		t.Fatalf("no synthesized setOptions strategy:\n%s", out)
	}
	guard := out[idx:]
	t.Logf("emitted guard:\n%s", guard)

	if m := privateKeyPattern.FindStringSubmatch(guard); m != nil {
		t.Errorf("guard keys on the #private backing field %q (unmatchable at runtime)", m[0])
	}
	if !strings.Contains(guard, `input.value`) && !strings.Contains(guard, `input["value"]`) {
		t.Errorf("public accessor `value` absent from the guard")
	}
	if strings.Contains(guard, "tsPriv") {
		t.Errorf("guard keys on a `private`-modifier member")
	}
}

// TestProbeAccessorOnlySurface: a class whose whole public surface is accessors
// over no backing field at all. Records whether an accessor contributes a guard
// clause — a guard with no clauses accepts every object.
func TestProbeAccessorOnlySurface(t *testing.T) {
	out, diags := run(t, `
export class AccessorOnly {
  public get a(): number { return 1; }
  public get b(): string { return "x"; }
}
export const AlphaExtensions = {
  setOptions(self: IAlpha, o: AccessorOnly | number): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Logf("diagnostics: %+v", diags)
	}
	idx := strings.Index(out, "setOptions:")
	if idx < 0 {
		t.Fatalf("no synthesized setOptions strategy:\n%s", out)
	}
	guard := out[idx:]
	t.Logf("emitted guard:\n%s", guard)

	if !strings.Contains(guard, "input.a") || !strings.Contains(guard, "input.b") {
		t.Errorf("accessors contribute no guard clause — the object branch accepts anything")
	}
}

// TestProbePrivateKeyIdStability: the same source lowered twice in one process
// records whether the private-identifier key's embedded id is stable. A drifting
// id makes the emitted artifact non-reproducible.
func TestProbePrivateKeyIdStability(t *testing.T) {
	ids := make([]string, 0, 2)
	for range 2 {
		out, _ := run(t, accessorClassFixture)
		m := privateKeyPattern.FindStringSubmatch(out)
		if m == nil {
			t.Skip("no private-identifier key in the emit; nothing to compare")
		}
		ids = append(ids, m[1])
	}
	t.Logf("private-identifier key ids across two lowerings: %v", ids)
	if ids[0] != ids[1] {
		t.Errorf("private-identifier key id drifts between lowerings: %v", ids)
	}
}
