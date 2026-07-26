package schemaoftransform

// Probes pinning what the schema walk emits for a CLASS root whose members are
// not all part of the public instance surface: an ECMAScript `#private` backing
// field behind a public accessor, a `private`/`protected`-modifier member, and a
// `static` member. Each probe reports the literal actually emitted so the walk's
// real behavior — not an assumption about it — is on the record.

import (
	"strings"
	"testing"
)

// literalFor lowers `schemaof<C>()` over src and returns the emitted object
// literal, or "" plus the diagnostic codes when the walk refused.
func literalFor(t *testing.T, src string) (string, []string) {
	t.Helper()
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerSchemaof(t, prog, sf)
	codes := make([]string, 0, len(diags))
	for _, d := range diags {
		codes = append(codes, d.Code)
	}
	if len(codes) != 0 {
		return "", codes
	}
	return bracedAfter(t, out, "s = "), nil
}

// TestProbePrivateNamedFieldBehindAccessor: a `#private` backing field with a
// public accessor over it. The public surface is `value: number`; a `#private`
// field is not a string-keyed property at runtime, so any key emitted for it can
// never match.
func TestProbePrivateNamedFieldBehindAccessor(t *testing.T) {
	src := `class C {
  #value: number = 0;
  public get value(): number { return this.#value; }
  public set value(v: number) { this.#value = v; }
}
export const s = schemaof<C>();
`
	literal, codes := literalFor(t, src)
	t.Logf("emitted literal: %s (diagnostics: %v)", literal, codes)

	if strings.Contains(literal, "#value") {
		t.Errorf("emitted a key for the #private backing field — unmatchable at runtime:\n%s", literal)
	}
	if !strings.Contains(literal, "value: \"number\"") && !strings.Contains(literal, "value: 'number'") {
		t.Errorf("public accessor `value` missing from the schema:\n%s", literal)
	}
}

// TestProbePrivateModifierMember: a TypeScript `private` member is outside the
// public surface a caller can supply.
func TestProbePrivateModifierMember(t *testing.T) {
	src := `class C {
  private secret: string = "";
  public host: string = "";
}
export const s = schemaof<C>();
`
	literal, codes := literalFor(t, src)
	t.Logf("emitted literal: %s (diagnostics: %v)", literal, codes)

	if strings.Contains(literal, "secret") {
		t.Errorf("emitted a key for a `private` member:\n%s", literal)
	}
}

// TestProbeProtectedModifierMember: same, for `protected`.
func TestProbeProtectedModifierMember(t *testing.T) {
	src := `class C {
  protected shared: string = "";
  public host: string = "";
}
export const s = schemaof<C>();
`
	literal, codes := literalFor(t, src)
	t.Logf("emitted literal: %s (diagnostics: %v)", literal, codes)

	if strings.Contains(literal, "shared") {
		t.Errorf("emitted a key for a `protected` member:\n%s", literal)
	}
}

// TestProbeStaticMember: a `static` member is not part of an instance surface.
func TestProbeStaticMember(t *testing.T) {
	src := `class C {
  static defaultHost: string = "";
  public host: string = "";
}
export const s = schemaof<C>();
`
	literal, codes := literalFor(t, src)
	t.Logf("emitted literal: %s (diagnostics: %v)", literal, codes)

	if strings.Contains(literal, "defaultHost") {
		t.Errorf("emitted a key for a `static` member:\n%s", literal)
	}
}

// TestProbeOnlyPrivateNamedMembers: a class whose ONLY members are `#private`
// fields has an EMPTY public surface. A schema built from it degenerates to `{}`,
// which coerces nothing — that must be refused, not emitted.
func TestProbeOnlyPrivateNamedMembers(t *testing.T) {
	src := `class C {
  #a: number = 0;
  #b: string = "";
}
export const s = schemaof<C>();
`
	literal, codes := literalFor(t, src)
	t.Logf("emitted literal: %s (diagnostics: %v)", literal, codes)

	if len(codes) == 0 {
		t.Errorf("an empty public surface must refuse, not emit %s", literal)
	}
}
